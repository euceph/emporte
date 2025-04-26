import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';

import type {
    formatEventsForGoogle as FormatEventsFunc,
    createCalendarEvents as CreateEventsFunc
} from '../../services/calendar.service';
import type { FastifyBaseLogger } from 'fastify';
import type { calendar_v3 } from 'googleapis';
import type { ScheduleData, ScheduleEvent } from '@emporte/common';

const mockDateFormat = vi.fn();
vi.doMock('date-fns-tz', () => ({
    format: mockDateFormat,
}));

const mockParseTimeToMinutes = vi.fn();
vi.doMock('@emporte/common', async (importOriginal) => {
    const original = await importOriginal() as Record<string, any>;
    return {
        ...original,
        parseTimeToMinutes: mockParseTimeToMinutes,
    };
});

const mockPLimitFn = vi.fn((fn) => fn());
const mockPLimit = vi.fn(() => mockPLimitFn);
vi.doMock('p-limit', () => ({
    default: mockPLimit,
}));

const mockEventsInsert = vi.fn();
const mockSetCredentials = vi.fn();

const mockCalendar = {
    events: {
        insert: mockEventsInsert,
    },
};
const mockGoogle = {
    calendar: vi.fn(() => mockCalendar),
};
vi.doMock('googleapis', () => ({
    google: mockGoogle,
}));

const mockOAuth2ClientInstance = {
    setCredentials: mockSetCredentials,
};
const mockOAuth2ClientConstructor = vi.fn(() => mockOAuth2ClientInstance);
vi.doMock('google-auth-library', () => ({
    OAuth2Client: mockOAuth2ClientConstructor,
}));


const mockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(() => mockLogger),
} as unknown as FastifyBaseLogger;

describe('calendar.service', () => {
    let formatEventsForGoogle: typeof FormatEventsFunc;
    let createCalendarEvents: typeof CreateEventsFunc;

    beforeAll(async () => {
        const serviceModule = await import('../../services/calendar.service');
        formatEventsForGoogle = serviceModule.formatEventsForGoogle;
        createCalendarEvents = serviceModule.createCalendarEvents;
    });

    beforeEach(() => {
        vi.clearAllMocks();

        vi.restoreAllMocks();

        mockDateFormat.mockImplementation((date, formatStr, options) => {
            const d = new Date(date);
            const tz = options?.timeZone || 'UTC';
            if (formatStr === "yyyy-MM-dd'T'HH:mm:ssXXX") {
                return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}+00:00`;
            }
            return `formatted_date_${tz}_${formatStr}`;
        });

        mockParseTimeToMinutes.mockImplementation((timeStr) => {
            if (timeStr === '09:00 AM') return 9 * 60;
            if (timeStr === '10:30 AM') return 10 * 60 + 30;
            if (timeStr === '01:00 PM') return 13 * 60;
            if (timeStr === '02:00 PM') return 14 * 60;
            return NaN;
        });
    });

    describe('formatEventsForGoogle', () => {

        const baseEvent: ScheduleEvent = {
            courseCode: 'TEST 101', courseName: 'Test Course', sectionDetails: 'Lec 01',
            days: ['Monday', 'Wednesday'], startTime: '09:00 AM', endTime: '10:30 AM', location: 'Room 1'
        };
        const baseScheduleData: ScheduleData = {
            termStartDate: '2024-09-02',
            termEndDate: '2024-12-10',
            scheduleEvents: [baseEvent]
        };
        const userTimeZone = 'America/New_York';

        it('should format a valid event correctly', () => {
            mockDateFormat
                .mockImplementationOnce((date, format, options) => `2024-09-02T09:00:00-04:00`)
                .mockImplementationOnce((date, format, options) => `2024-09-02T10:30:00-04:00`);

            const result = formatEventsForGoogle(baseScheduleData, userTimeZone, mockLogger);

            expect(mockLogger.error).not.toHaveBeenCalled();
            expect(result).toHaveLength(1);
            const googleEvent = result[0];

            expect(googleEvent.summary).toBe('TEST 101 (Lec 01) - Test Course');
            expect(googleEvent.location).toBe('Room 1');
            expect(googleEvent.description).toContain('Course: TEST 101');
            expect(googleEvent.start?.dateTime).toBe('2024-09-02T09:00:00-04:00');
            expect(googleEvent.start?.timeZone).toBe(userTimeZone);
            expect(googleEvent.end?.dateTime).toBe('2024-09-02T10:30:00-04:00');
            expect(googleEvent.end?.timeZone).toBe(userTimeZone);
            expect(googleEvent.recurrence).toEqual(['RRULE:FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=20241211T000000Z']);
            expect(googleEvent.reminders?.useDefault).toBe(false);
            expect(googleEvent.colorId).toBeDefined();
        });

        it('should assign consistent colors to same courseCode and different colors to different codes', () => {
            const event1 = { ...baseEvent, courseCode: 'CS101', days: ['Monday'] };
            const event2 = { ...baseEvent, courseCode: 'MA201', days: ['Tuesday'] };
            const event3 = { ...baseEvent, courseCode: 'CS101', sectionDetails: 'Lab', days: ['Wednesday'] };
            const schedule = { ...baseScheduleData, scheduleEvents: [event1, event2, event3] };

            const result = formatEventsForGoogle(schedule, userTimeZone, mockLogger);

            expect(result).toHaveLength(3);
            const color1 = result[0].colorId;
            const color2 = result[1].colorId;
            const color3 = result[2].colorId;

            expect(color1).toBeDefined();
            expect(color2).toBeDefined();
            expect(color3).toBeDefined();
            expect(color1).not.toBe(color2);
            expect(color1).toBe(color3);
        });

        it('should throw error if timezone is invalid', () => {
            const originalDateTimeFormat = Intl.DateTimeFormat;
            vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(() => { throw new Error('Invalid timezone'); });

            expect(() => formatEventsForGoogle(baseScheduleData, 'Invalid/Zone', mockLogger))
                .toThrow(/Invalid user timezone/);
            expect(mockLogger.error).toHaveBeenCalledWith(expect.objectContaining({ providedTimeZone: 'Invalid/Zone'}), expect.stringContaining("Invalid IANA user timezone"));

            vi.spyOn(Intl, 'DateTimeFormat').mockRestore();
        });

        it('should throw error if termStartDate is missing', () => {
            expect(() => formatEventsForGoogle({ ...baseScheduleData, termStartDate: null }, userTimeZone, mockLogger))
                .toThrow('Term start and end dates are required');
            expect(mockLogger.error).toHaveBeenCalledWith("Cannot format events: Missing term start or end date.");
        });

        it('should throw error if termEndDate is missing', () => {
            expect(() => formatEventsForGoogle({ ...baseScheduleData, termEndDate: null }, userTimeZone, mockLogger))
                .toThrow('Term start and end dates are required');
            expect(mockLogger.error).toHaveBeenCalledWith("Cannot format events: Missing term start or end date.");
        });

        it('should throw error if term date format is invalid', () => {
            expect(() => formatEventsForGoogle({ ...baseScheduleData, termStartDate: 'invalid-date' }, userTimeZone, mockLogger))
                .toThrow('Invalid term start or end date format');
            expect(mockLogger.error).toHaveBeenCalledWith(expect.objectContaining({termStartDate: 'invalid-date'}), "Invalid term date format detected.");
        });

        it('should skip event if days array is empty', () => {
            const schedule = { ...baseScheduleData, scheduleEvents: [{ ...baseEvent, days: [] }] };
            const result = formatEventsForGoogle(schedule, userTimeZone, mockLogger);
            expect(result).toHaveLength(0);
            expect(mockLogger.warn).toHaveBeenCalledWith(expect.objectContaining({ eventSummary: 'TEST 101' }), "Skipping event: Missing 'days'.");
        });

        it('should skip event if time parsing fails (NaN)', () => {
            mockParseTimeToMinutes.mockReturnValueOnce(NaN);
            const schedule = { ...baseScheduleData, scheduleEvents: [{ ...baseEvent, startTime: 'invalid' }] };
            const result = formatEventsForGoogle(schedule, userTimeZone, mockLogger);
            expect(result).toHaveLength(0);
            expect(mockLogger.warn).toHaveBeenCalledWith(expect.objectContaining({ eventSummary: 'TEST 101' }), "Skipping event: Invalid time/day.");
        });

        it('should skip event if start time is >= end time', () => {
            mockParseTimeToMinutes
                .mockReturnValueOnce(10 * 60)
                .mockReturnValueOnce(9 * 60);
            const schedule = { ...baseScheduleData, scheduleEvents: [{ ...baseEvent, startTime: '10:00 AM', endTime: '09:00 AM'}] };
            const result = formatEventsForGoogle(schedule, userTimeZone, mockLogger);
            expect(result).toHaveLength(0);
            expect(mockLogger.warn).toHaveBeenCalledWith(expect.objectContaining({ eventSummary: 'TEST 101' }), "Skipping event: Start >= End.");
        });

    });


    describe('createCalendarEvents', () => {
        const accessToken = 'test-access-token';
        const googleEvent1: calendar_v3.Schema$Event = { summary: 'Event 1', start: {}, end: {} };
        const googleEvent2: calendar_v3.Schema$Event = { summary: 'Event 2', start: {}, end: {} };

        it('should create all events successfully', async () => {
            mockEventsInsert
                .mockResolvedValueOnce({ data: { id: 'id1' }, status: 200 })
                .mockResolvedValueOnce({ data: { id: 'id2' }, status: 200 });

            const result = await createCalendarEvents(accessToken, [googleEvent1, googleEvent2], mockLogger);

            expect(mockSetCredentials).toHaveBeenCalledWith({ access_token: accessToken });
            expect(mockGoogle.calendar).toHaveBeenCalledWith({ version: 'v3', auth: mockOAuth2ClientInstance });
            expect(mockEventsInsert).toHaveBeenCalledTimes(2);
            expect(mockEventsInsert).toHaveBeenNthCalledWith(1, { calendarId: 'primary', requestBody: googleEvent1 });
            expect(mockEventsInsert).toHaveBeenNthCalledWith(2, { calendarId: 'primary', requestBody: googleEvent2 });
            expect(mockPLimit).toHaveBeenCalledWith(expect.any(Number));
            expect(mockPLimitFn).toHaveBeenCalledTimes(2);
            expect(result.successCount).toBe(2);
            expect(result.errors).toHaveLength(0);
            expect(mockLogger.error).not.toHaveBeenCalled();
        });

        it('should handle partial success and report errors', async () => {
            const apiError = {
                response: { data: { error: { message: 'Event conflict' } }, status: 409 },
                message: 'API Error',
            };
            mockEventsInsert
                .mockResolvedValueOnce({ data: { id: 'id1' }, status: 200 })
                .mockRejectedValueOnce(apiError);

            const result = await createCalendarEvents(accessToken, [googleEvent1, googleEvent2], mockLogger);

            expect(mockEventsInsert).toHaveBeenCalledTimes(2);
            expect(result.successCount).toBe(1);
            expect(result.errors).toHaveLength(1);
            expect(result.errors[0]).toEqual({
                eventSummary: 'Event 2',
                error: 'Event conflict',
                status: 409,
            });
            expect(mockLogger.error).toHaveBeenCalledWith(expect.objectContaining({ err: { message: 'Event conflict', status: 409 } }), expect.stringContaining("Event insertion task failed."));
            expect(mockLogger.warn).toHaveBeenCalledWith(expect.objectContaining({ reason: expect.any(Object) }), expect.stringContaining("Event creation failed"));
        });

        it('should handle complete failure', async () => {
            const apiError1 = { message: 'Invalid credentials', response: { status: 401 } };
            const apiError2 = { message: 'Rate limit exceeded', response: { status: 403 } };
            mockEventsInsert
                .mockRejectedValueOnce(apiError1)
                .mockRejectedValueOnce(apiError2);

            const result = await createCalendarEvents(accessToken, [googleEvent1, googleEvent2], mockLogger);

            expect(mockEventsInsert).toHaveBeenCalledTimes(2);
            expect(result.successCount).toBe(0);
            expect(result.errors).toHaveLength(2);
            expect(result.errors[0].error).toBe('Invalid credentials');
            expect(result.errors[0].status).toBe(401);
            expect(result.errors[1].error).toBe('Rate limit exceeded');
            expect(result.errors[1].status).toBe(403);
        });
    });
});
