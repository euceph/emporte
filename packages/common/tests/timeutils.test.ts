import { describe, it, expect } from 'vitest';
import { parseTimeToMinutes, formatMinutesToTime, getDayIndex } from '../src';

describe('parseTimeToMinutes', () => {
    it('should correctly parse valid AM time', () => {
        expect(parseTimeToMinutes('09:30 AM')).toBe(9 * 60 + 30);
    });

    it('should correctly parse valid PM time', () => {
        expect(parseTimeToMinutes('01:45 PM')).toBe(13 * 60 + 45);
    });

    it('should correctly parse 12:00 AM as 0 minutes', () => {
        expect(parseTimeToMinutes('12:00 AM')).toBe(0);
    });

    it('should correctly parse 12:00 PM as 720 minutes', () => {
        expect(parseTimeToMinutes('12:00 PM')).toBe(12 * 60);
    });

    it('should return NaN for invalid time format', () => {
        expect(parseTimeToMinutes('9:30 AM PM')).toBeNaN();
        expect(parseTimeToMinutes('9:30')).toBeNaN();
        expect(parseTimeToMinutes('09:65 AM')).toBeNaN();
        expect(parseTimeToMinutes('13:00 PM')).toBeNaN();
        expect(parseTimeToMinutes('invalid string')).toBeNaN();
    });

    it('should return NaN for null or undefined input', () => {
        expect(parseTimeToMinutes(undefined)).toBeNaN();
        expect(parseTimeToMinutes(null)).toBeNaN();
    });

    it('should handle lowercase am/pm', () => {
        expect(parseTimeToMinutes('09:30 am')).toBe(9 * 60 + 30);
        expect(parseTimeToMinutes('01:45 pm')).toBe(13 * 60 + 45);
    });
});

describe('formatMinutesToTime', () => {
    it('should format morning times correctly', () => {
        expect(formatMinutesToTime(570)).toBe('9:30 AM');
    });

    it('should format afternoon times correctly', () => {
        expect(formatMinutesToTime(825)).toBe('1:45 PM');
    });

    it('should format midnight correctly', () => {
        expect(formatMinutesToTime(0)).toBe('12:00 AM');
    });

    it('should format noon correctly', () => {
        expect(formatMinutesToTime(720)).toBe('12:00 PM');
    });

    it('should handle single digit hours correctly', () => {
        expect(formatMinutesToTime(60)).toBe('1:00 AM');
    });

    it('should include leading zero when requested', () => {
        expect(formatMinutesToTime(570, true)).toBe('09:30 AM');
        expect(formatMinutesToTime(825, true)).toBe('01:45 PM');
        expect(formatMinutesToTime(0, true)).toBe('12:00 AM');
        expect(formatMinutesToTime(720, true)).toBe('12:00 PM');
    });

    it('should return "Invalid Time" for out-of-bounds values', () => {
        expect(formatMinutesToTime(-1)).toBe('Invalid Time');
        expect(formatMinutesToTime(24 * 60)).toBe('Invalid Time');
        expect(formatMinutesToTime(NaN)).toBe('Invalid Time');
    });
});

describe('getDayIndex', () => {
    it('should return correct index for valid weekdays', () => {
        expect(getDayIndex('monday')).toBe(0);
        expect(getDayIndex('Tuesday')).toBe(1);
        expect(getDayIndex('WEDNESDAY')).toBe(2);
        expect(getDayIndex('Thursday')).toBe(3);
        expect(getDayIndex('Friday')).toBe(4);
    });

    it('should return -1 for invalid or weekend days', () => {
        expect(getDayIndex('saturday')).toBe(-1);
        expect(getDayIndex('sunday')).toBe(-1);
        expect(getDayIndex('InvalidDay')).toBe(-1);
        expect(getDayIndex('')).toBe(-1);
    });
});
