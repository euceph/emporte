import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
    scheduleEventSchema,
    scheduleDataSchema,
    createCalendarBodySchema,
    type ScheduleEvent,
    type ScheduleData
} from '../src';

describe('scheduleEventSchema', () => {
    const validEventData: ScheduleEvent = {
        courseCode: 'CS 101',
        courseName: 'Intro to CS',
        sectionDetails: 'Lecture 001',
        days: ['Monday', 'Wednesday'],
        startTime: '09:00 AM',
        endTime: '10:15 AM',
        location: 'Tech Hall 100',
    };

    it('should validate correct event data successfully', () => {
        const result = scheduleEventSchema.safeParse(validEventData);
        expect(result.success).toBe(true);
    });

    it('should allow null values for optional fields', () => {
        const result = scheduleEventSchema.safeParse({
            ...validEventData,
            courseName: null,
            sectionDetails: null,
            location: null,
        });
        expect(result.success).toBe(true);
    });

    it('should fail validation if required fields are missing', () => {
        const { courseCode, ...incompleteData } = validEventData;
        const result = scheduleEventSchema.safeParse(incompleteData);
        expect(result.success).toBe(false);
    });

    it('should fail validation if days array is empty', () => {
        const result = scheduleEventSchema.safeParse({ ...validEventData, days: [] });
        expect(result.success).toBe(false);
    });

    it('should fail validation for invalid time format (startTime)', () => {
        const result = scheduleEventSchema.safeParse({ ...validEventData, startTime: '9 AM' });
        expect(result.success).toBe(false);
    });

    it('should fail validation for invalid time format (endTime)', () => {
        const result = scheduleEventSchema.safeParse({ ...validEventData, endTime: '10:15' });
        expect(result.success).toBe(false);
    });

    it('should fail validation if a field has the wrong type', () => {
        const result = scheduleEventSchema.safeParse({ ...validEventData, days: 'Monday' });
        expect(result.success).toBe(false);
    });

});

describe('scheduleDataSchema', () => {
    const validEvent: ScheduleEvent = {
        courseCode: 'CS 101', courseName: 'Intro', sectionDetails: null,
        days: ['Tuesday'], startTime: '10:00 AM', endTime: '11:00 AM', location: null
    };
    const validScheduleData: ScheduleData = {
        termStartDate: '2024-09-01',
        termEndDate: '2024-12-15',
        scheduleEvents: [validEvent, { ...validEvent, courseCode: 'MATH 200' }],
    };

    it('should validate correct schedule data successfully', () => {
        const result = scheduleDataSchema.safeParse(validScheduleData);
        expect(result.success).toBe(true);
    });

    it('should allow null values for term dates', () => {
        const result = scheduleDataSchema.safeParse({
            ...validScheduleData,
            termStartDate: null,
            termEndDate: null,
        });
        expect(result.success).toBe(true);
    });

    it('should allow empty scheduleEvents array', () => {
        const result = scheduleDataSchema.safeParse({
            ...validScheduleData,
            scheduleEvents: [],
        });
        expect(result.success).toBe(true);
    });

    it('should fail validation if scheduleEvents is not an array', () => {
        const result = scheduleDataSchema.safeParse({
            ...validScheduleData,
            scheduleEvents: { event: validEvent },
        });
        expect(result.success).toBe(false);
    });

    it('should fail validation if an event within scheduleEvents is invalid', () => {
        const invalidEvent = { ...validEvent, startTime: 'invalid-time' };
        const result = scheduleDataSchema.safeParse({
            ...validScheduleData,
            scheduleEvents: [validEvent, invalidEvent],
        });
        expect(result.success).toBe(false);
    });
});

describe('createCalendarBodySchema', () => {
    const validBaseData: ScheduleData = {
        termStartDate: '2024-09-01', termEndDate: '2024-12-15',
        scheduleEvents: [{
            courseCode: 'PHYS 1A', courseName: 'Physics', sectionDetails: 'Lab',
            days: ['Friday'], startTime: '02:00 PM', endTime: '04:50 PM', location: 'Sci Lab 3'
        }]
    };

    it('should validate correct body data with valid timezone', () => {
        const result = createCalendarBodySchema.safeParse({
            ...validBaseData,
            userTimeZone: 'America/New_York',
        });
        expect(result.success).toBe(true);
    });

    it('should validate with another valid timezone', () => {
        const result = createCalendarBodySchema.safeParse({
            ...validBaseData,
            userTimeZone: 'Europe/London',
        });
        expect(result.success).toBe(true);
    });

    it('should fail if timezone is missing', () => {
        const { userTimeZone, ...missingTzData } = { ...validBaseData, userTimeZone: 'America/Los_Angeles'};
        const result = createCalendarBodySchema.safeParse(missingTzData);
        expect(result.success).toBe(false);
    });

    it('should fail if timezone is an invalid IANA identifier', () => {
        const result = createCalendarBodySchema.safeParse({
            ...validBaseData,
            userTimeZone: 'Invalid/Timezone',
        });
        expect(result.success).toBe(false);
    });

    it('should fail if timezone is too short (basic zod check)', () => {
        const result = createCalendarBodySchema.safeParse({
            ...validBaseData,
            userTimeZone: 'A',
        });
        expect(result.success).toBe(false);
    });

    it('should fail if base schedule data is invalid', () => {
        const result = createCalendarBodySchema.safeParse({
            ...validBaseData,
            scheduleEvents: [{ ...validBaseData.scheduleEvents[0], days: [] }],
            userTimeZone: 'America/Denver',
        });
        expect(result.success).toBe(false);
    });
});
