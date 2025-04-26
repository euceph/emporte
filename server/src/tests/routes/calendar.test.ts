import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { FastifyInstance } from 'fastify';
import request from 'supertest';
import IORedis from 'ioredis';

import { buildTestServer, cleanupTestDatabase } from '../helpers/server.helper';
import { createCalendarBodySchema, type CreateCalendarBody } from '@emporte/common';
import { ScheduleData, ScheduleEvent } from '@emporte/common';

vi.mock('../../services/calendar.service', () => ({
    formatEventsForGoogle: vi.fn(),
    createCalendarEvents: vi.fn(),
}));

import { formatEventsForGoogle, createCalendarEvents } from '../../services/calendar.service';

const mockedFormatEvents = formatEventsForGoogle as vi.Mock;
const mockedCreateEvents = createCalendarEvents as vi.Mock;

const validScheduleEvent: ScheduleEvent = { courseCode: "CS101", courseName: "Intro to CS", sectionDetails: "Sec A", days: ["Mon", "Wed"], startTime: "10:00 AM", endTime: "11:00 AM", location: "Room 101" };
const validRequestBody: CreateCalendarBody = {
    termStartDate: "2024-09-01",
    termEndDate: "2024-12-15",
    scheduleEvents: [validScheduleEvent],
    userTimeZone: 'America/New_York'
};
const sampleGoogleEvent = { summary: 'Formatted CS101',};

const TEST_REDIS_URL = process.env.TEST_REDIS_URL || 'redis://localhost:6379/1';
let redisClientForTestChecks: IORedis;

describe('Calendar Routes', () => {
    let app: FastifyInstance;
    let redisDelSpy: vi.SpyInstance;

    beforeAll(async () => {
        app = await buildTestServer();
        redisClientForTestChecks = new IORedis(TEST_REDIS_URL);

        if (app.redis) {
            redisDelSpy = vi.spyOn(app.redis, 'del');
        } else { throw new Error("app.redis decorator not found."); }
    });

    afterAll(async () => {
        await redisClientForTestChecks.quit();
        await app.close();
    });

    beforeEach(async () => {
        mockedFormatEvents.mockReset();
        mockedCreateEvents.mockReset();
        redisDelSpy.mockReset();
        await cleanupTestDatabase();
    });

    async function getAuthCookie(): Promise<{ cookie: string, sessionId: string }> {
        const loginResponse = await request(app.server).post('/test/login').send({ accessToken: 'calendar-test-token', expiresAt: Date.now() + 3600000 });
        if (loginResponse.status !== 200) { throw new Error(`Test login failed`); }
        const cookiesHeader = loginResponse.headers['set-cookie'];
        let sessionCookie: string | undefined;
        if (Array.isArray(cookiesHeader)) { sessionCookie = cookiesHeader.find((c: string) => c.startsWith('sessionId=')); }
        else if (typeof cookiesHeader === 'string' && cookiesHeader.startsWith('sessionId=')) { sessionCookie = cookiesHeader; }
        if (!sessionCookie) { throw new Error("Session cookie not found"); }
        const cookieValue = sessionCookie.substring('sessionId='.length);
        const idPart = cookieValue?.split('.')[0]?.split(';')[0];
        if (!idPart) { throw new Error("Could not extract session ID"); }
        return { cookie: sessionCookie, sessionId: idPart };
    }


    describe('POST /api/calendar/create', () => {

        it('should return 401 Unauthorized if user is not logged in', async () => {
            const response = await request(app.server)
                .post('/api/calendar/create')
                .send(validRequestBody);

            expect(response.status).toBe(401);
            expect(mockedFormatEvents).not.toHaveBeenCalled();
            expect(mockedCreateEvents).not.toHaveBeenCalled();
            expect(redisDelSpy).toHaveBeenCalledTimes(1);
            expect(redisDelSpy).toHaveBeenCalledWith(expect.arrayContaining([
                expect.stringMatching(/^session:/)
            ]));
        });

        it('should return 400 Bad Request if request body fails Zod validation', async () => {
            const { cookie } = await getAuthCookie();
            const invalidBody = { ...validRequestBody, userTimeZone: '' };

            const response = await request(app.server)
                .post('/api/calendar/create')
                .set('Cookie', cookie)
                .send(invalidBody);

            expect(response.status).toBe(400);
            expect(response.body.success).toBe(false);
            expect(response.body.error).toEqual('Validation Error');
            expect(response.body.details).toBeInstanceOf(Array);
            expect(response.body.details[0]?.path).toEqual('userTimeZone');
            expect(mockedFormatEvents).not.toHaveBeenCalled();
            expect(mockedCreateEvents).not.toHaveBeenCalled();
            expect(redisDelSpy).not.toHaveBeenCalled();
        });

        it('should return 400 Bad Request if formatEventsForGoogle throws timezone error', async () => {
            const { cookie, sessionId } = await getAuthCookie();
            const errorMessage = "Invalid user timezone provided";
            mockedFormatEvents.mockImplementation(() => { throw new Error(errorMessage); });

            const response = await request(app.server)
                .post('/api/calendar/create')
                .set('Cookie', cookie)
                .send(validRequestBody);

            expect(response.status).toBe(400);
            expect(response.body).toEqual({ success: false, error: 'Bad Request', message: errorMessage, });
            expect(mockedFormatEvents).toHaveBeenCalledTimes(1);
            expect(mockedCreateEvents).not.toHaveBeenCalled();
        });

        it('should return 500 Internal Server Error if formatEventsForGoogle throws other error', async () => {
            const { cookie, sessionId } = await getAuthCookie();
            const errorMessage = "Unexpected formatting issue";
            mockedFormatEvents.mockImplementation(() => { throw new Error(errorMessage); });

            const response = await request(app.server)
                .post('/api/calendar/create')
                .set('Cookie', cookie)
                .send(validRequestBody);

            expect(response.status).toBe(500);
            expect(response.body).toEqual({ success: false, error: 'Processing Error', message: `Failed to process schedule: ${errorMessage}`, });
            expect(mockedFormatEvents).toHaveBeenCalledTimes(1);
            expect(mockedCreateEvents).not.toHaveBeenCalled();
        });


        it('should return 200 OK with "no valid events" message if formatEventsForGoogle returns empty array', async () => {
            const { cookie, sessionId } = await getAuthCookie();
            mockedFormatEvents.mockReturnValue([]);
            redisDelSpy.mockResolvedValue(1);

            const response = await request(app.server)
                .post('/api/calendar/create')
                .set('Cookie', cookie)
                .send(validRequestBody);

            expect(response.status).toBe(200);
            expect(response.body).toEqual({
                success: true,
                message: "Schedule processed, but no valid events found to add to the calendar.",
                details: { created: 0 }
            });
            expect(mockedFormatEvents).toHaveBeenCalledTimes(1);
            expect(mockedCreateEvents).not.toHaveBeenCalled();
            expect(redisDelSpy).toHaveBeenCalledWith(`preview:${sessionId}`);
        });

        it('should return 200 OK with error details if createCalendarEvents throws an error', async () => {
            const { cookie, sessionId } = await getAuthCookie();
            const createError = new Error("Google API quota exceeded");
            mockedFormatEvents.mockReturnValue([sampleGoogleEvent]);
            mockedCreateEvents.mockImplementation(async () => { throw createError; });
            redisDelSpy.mockResolvedValue(1);

            const response = await request(app.server)
                .post('/api/calendar/create')
                .set('Cookie', cookie)
                .send(validRequestBody);

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(false);
            expect(response.body.message).toMatch(/Created 0 event series, but failed for 1/);
            expect(response.body.details.successCount).toBe(0);
            expect(response.body.details.errors).toBeInstanceOf(Array);
            expect(response.body.details.errors[0]?.eventSummary).toEqual('Overall Process Failure');
            expect(response.body.details.errors[0]?.error).toEqual(createError.message);
            expect(mockedFormatEvents).toHaveBeenCalledTimes(1);
            expect(mockedCreateEvents).toHaveBeenCalledTimes(1);
            expect(redisDelSpy).toHaveBeenCalledWith(`preview:${sessionId}`);
        });

        it('should return 200 OK with partial success message if createCalendarEvents returns errors', async () => {
            const { cookie, sessionId } = await getAuthCookie();
            const partialResult = {
                successCount: 1,
                errors: [{ eventSummary: 'Event 2', error: 'Conflict' }]
            };
            mockedFormatEvents.mockReturnValue([sampleGoogleEvent, { ...sampleGoogleEvent, summary: 'Event 2'}]);
            mockedCreateEvents.mockResolvedValue(partialResult);
            redisDelSpy.mockResolvedValue(1);

            const response = await request(app.server)
                .post('/api/calendar/create')
                .set('Cookie', cookie)
                .send(validRequestBody);

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(false);
            expect(response.body.message).toEqual(`Created ${partialResult.successCount} event series, but failed for ${partialResult.errors.length}.`);
            expect(response.body.details).toEqual(partialResult);
            expect(mockedFormatEvents).toHaveBeenCalledTimes(1);
            expect(mockedCreateEvents).toHaveBeenCalledTimes(1);
            expect(redisDelSpy).toHaveBeenCalledWith(`preview:${sessionId}`);
        });


        it('should return 200 OK with full success message and delete preview key on full success', async () => {
            const { cookie, sessionId } = await getAuthCookie();
            const fullSuccessResult = {
                successCount: 1,
                errors: []
            };
            mockedFormatEvents.mockReturnValue([sampleGoogleEvent]);
            mockedCreateEvents.mockResolvedValue(fullSuccessResult);
            redisDelSpy.mockResolvedValue(1);

            const response = await request(app.server)
                .post('/api/calendar/create')
                .set('Cookie', cookie)
                .send(validRequestBody);

            expect(response.status).toBe(200);
            expect(response.body).toEqual({
                success: true,
                message: `Successfully created ${fullSuccessResult.successCount} event series.`,
                details: { created: fullSuccessResult.successCount }
            });
            expect(mockedFormatEvents).toHaveBeenCalledTimes(1);
            expect(mockedCreateEvents).toHaveBeenCalledWith(
                expect.any(String),
                [sampleGoogleEvent],
                expect.anything()
            );
            expect(redisDelSpy).toHaveBeenCalledTimes(1);
            expect(redisDelSpy).toHaveBeenCalledWith(`preview:${sessionId}`);

        });


    });

});