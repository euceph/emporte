import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';

import type { processAiJob as ProcessAiJobFunc } from '../../services/worker.service';
import type { AiJobData } from '../../services/worker.service';
import type { FastifyBaseLogger } from 'fastify';
import type Redis from 'ioredis';
import type { Job } from 'bullmq';
import {
    previewResultSchema,
    type ScheduleData,
    type ScheduleEvent,
    type ProcessingWarning,
    type ProcessingError,
    type PreviewResult
} from '@emporte/common';
import { z } from 'zod';

const mockReadFile = vi.fn();
const mockUnlink = vi.fn();
vi.mock('node:fs/promises', async () => {
    return {
        __esModule: true,
        readFile: mockReadFile,
        unlink: mockUnlink,
        default: {
            readFile: mockReadFile,
            unlink: mockUnlink,
        },
    };
});

const mockRedisSet = vi.fn();
const mockRedisClient = {
    set: mockRedisSet,
} as unknown as Redis;

const mockExtractSchedule = vi.fn();
vi.doMock('../../services/ai.service', () => ({
    extractScheduleFromImage: mockExtractSchedule,
}));

const mockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(() => mockLogger),
} as unknown as FastifyBaseLogger;

describe('worker.service: processAiJob', () => {
    let processAiJob: typeof ProcessAiJobFunc;

    beforeAll(async () => {
        const serviceModule = await import('../../services/worker.service');
        processAiJob = serviceModule.processAiJob;
    });

    beforeEach(() => {
        vi.clearAllMocks();
        vi.restoreAllMocks();
        mockReadFile.mockReset();
        mockUnlink.mockReset();
        mockRedisSet.mockReset();
        mockExtractSchedule.mockReset();
    });

    const createMockJob = (data: AiJobData): Job<AiJobData> => ({
        id: 'test-job-123', data,
    } as Job<AiJobData>);

    const baseJobData: AiJobData = {
        sessionId: 'test-session-id',
        tempFilePaths: ['/tmp/file1.png'],
        mimeTypes: ['image/png'],
        originalFilenames: ['upload1.png'],
    };

    it('should process a single valid file successfully and save PreviewResult', async () => {
        const job = createMockJob(baseJobData);
        const mockFileData = Buffer.from('fake image data');
        const invalidEventStructure = {
            courseCode: 'INVALID', days: [], startTime: '11:00 AM', endTime: '12:00 PM',
            courseName: null, sectionDetails: null, location: null
        };
        const mockAiResponse = {
            termStartDate: '2024-01-10', termEndDate: '2024-05-15',
            scheduleEvents: [
                { courseCode: 'CS101', days: ['Mon'], startTime: '10:00 AM', endTime: '11:00 AM', courseName: null, sectionDetails: null, location: null },
                invalidEventStructure
            ]
        };
        const expectedScheduleData: ScheduleData = {
            termStartDate: '2024-01-10', termEndDate: '2024-05-15',
            scheduleEvents: [
                { courseCode: 'CS101', days: ['Mon'], startTime: '10:00 AM', endTime: '11:00 AM', courseName: null, sectionDetails: null, location: null },
            ]
        };
        const expectedPreviewResult: PreviewResult = {
            scheduleData: expectedScheduleData,
            processingWarnings: [],
            processingErrors: []
        };

        mockReadFile.mockResolvedValue(mockFileData);
        mockExtractSchedule.mockResolvedValue(mockAiResponse);
        mockRedisSet.mockResolvedValue('OK');
        mockUnlink.mockResolvedValue(undefined);

        const result = await processAiJob(job, mockRedisClient, mockLogger);

        expect(mockReadFile).toHaveBeenCalledWith('/tmp/file1.png');
        expect(mockExtractSchedule).toHaveBeenCalledWith(mockFileData.toString('base64'), 'image/png', expect.anything(), 'upload1.png');

        expect(mockRedisSet).toHaveBeenCalledOnce();
        const redisCallArgs = mockRedisSet.mock.calls[0];
        expect(redisCallArgs[0]).toBe(`preview:${baseJobData.sessionId}`);
        expect(JSON.parse(redisCallArgs[1])).toEqual(expectedPreviewResult);
        expect(redisCallArgs[2]).toBe('EX');
        expect(redisCallArgs[3]).toBe(1800);

        expect(mockUnlink).toHaveBeenCalledWith('/tmp/file1.png');
        expect(result.message).toContain('Processed 1/1 files.');
        expect(result.finalEventCount).toBe(1);
        expect(result.warningCount).toBe(0);
        expect(result.errorCount).toBe(0);
        expect(mockLogger.error).not.toHaveBeenCalled();
        expect(mockLogger.warn).toHaveBeenCalledWith(expect.objectContaining({ event: invalidEventStructure }), expect.stringContaining("Filtering out invalid event"));
    });

    it('should process multiple files, merge results, and save PreviewResult', async () => {
        const jobData: AiJobData = {
            sessionId: 'multi-session',
            tempFilePaths: ['/tmp/f1.jpg', '/tmp/f2.png'],
            mimeTypes: ['image/jpeg', 'image/png'],
            originalFilenames: ['img1.jpg', 'sched2.png'],
        };
        const job = createMockJob(jobData);
        const fileData1 = Buffer.from('jpeg data');
        const fileData2 = Buffer.from('png data');
        const aiResponse1 = {
            termStartDate: '2024-09-01', termEndDate: null,
            scheduleEvents: [{ courseCode: 'MATH200', days: ['Tue', 'Thu'], startTime: '01:00 PM', endTime: '02:00 PM', courseName: null, sectionDetails: null, location: null }]
        };
        const aiResponse2 = {
            termStartDate: null, termEndDate: '2024-12-15',
            scheduleEvents: [{ courseCode: 'CHEM101', days: ['Fri'], startTime: '09:00 AM', endTime: '10:00 AM', courseName: 'Gen Chem', sectionDetails: null, location: null }]
        };
        const expectedScheduleData: ScheduleData = {
            termStartDate: '2024-09-01', termEndDate: '2024-12-15',
            scheduleEvents: [
                { courseCode: 'MATH200', days: ['Tue', 'Thu'], startTime: '01:00 PM', endTime: '02:00 PM', courseName: null, sectionDetails: null, location: null },
                { courseCode: 'CHEM101', days: ['Fri'], startTime: '09:00 AM', endTime: '10:00 AM', courseName: 'Gen Chem', sectionDetails: null, location: null }
            ]
        };
        const expectedPreviewResult: PreviewResult = {
            scheduleData: expectedScheduleData,
            processingWarnings: [],
            processingErrors: []
        };

        mockReadFile.mockResolvedValueOnce(fileData1).mockResolvedValueOnce(fileData2);
        mockExtractSchedule.mockResolvedValueOnce(aiResponse1).mockResolvedValueOnce(aiResponse2);
        mockRedisSet.mockResolvedValue('OK');
        mockUnlink.mockResolvedValue(undefined);

        const result = await processAiJob(job, mockRedisClient, mockLogger);

        expect(mockReadFile).toHaveBeenCalledTimes(2);
        expect(mockExtractSchedule).toHaveBeenCalledTimes(2);

        expect(mockRedisSet).toHaveBeenCalledOnce();
        const redisCallArgsMulti = mockRedisSet.mock.calls[0];
        expect(redisCallArgsMulti[0]).toBe(`preview:multi-session`);
        expect(JSON.parse(redisCallArgsMulti[1])).toEqual(expectedPreviewResult);
        expect(redisCallArgsMulti[2]).toBe('EX');
        expect(redisCallArgsMulti[3]).toBe(1800);

        expect(mockUnlink).toHaveBeenCalledTimes(2);
        expect(result.message).toContain('Processed 2/2 files.');
        expect(result.finalEventCount).toBe(2);
        expect(result.warningCount).toBe(0);
        expect(result.errorCount).toBe(0);
    });

    it('should handle AI error for one file and include it in processingErrors', async () => {
        const jobData: AiJobData = {
            sessionId: 'partial-fail-session',
            tempFilePaths: ['/tmp/good.png', '/tmp/bad.png'],
            mimeTypes: ['image/png', 'image/png'],
            originalFilenames: ['good.png', 'bad.png'],
        };
        const job = createMockJob(jobData);
        const goodData = Buffer.from('good');
        const badData = Buffer.from('bad');
        const aiResponseGood = { termStartDate: '2024-01-01', termEndDate: '2024-05-01', scheduleEvents: [{ courseCode: 'GOOD101', days: ['Mon'], startTime: '10:00 AM', endTime: '11:00 AM', courseName: null, sectionDetails: null, location: null }] };
        const aiError = new Error('AI processing failed');
        const expectedScheduleData: ScheduleData = {
            termStartDate: '2024-01-01', termEndDate: '2024-05-01',
            scheduleEvents: aiResponseGood.scheduleEvents
        };
        const expectedPreviewResult: PreviewResult = {
            scheduleData: expectedScheduleData,
            processingWarnings: [],
            processingErrors: [
                { filename: 'bad.png', error: 'AI processing failed' }
            ]
        };

        mockReadFile.mockResolvedValueOnce(goodData).mockResolvedValueOnce(badData);
        mockExtractSchedule.mockResolvedValueOnce(aiResponseGood).mockRejectedValueOnce(aiError);
        mockRedisSet.mockResolvedValue('OK');
        mockUnlink.mockResolvedValue(undefined);

        const result = await processAiJob(job, mockRedisClient, mockLogger);

        expect(mockReadFile).toHaveBeenCalledTimes(2);
        expect(mockExtractSchedule).toHaveBeenCalledTimes(2);
        expect(mockRedisSet).toHaveBeenCalledOnce();
        const redisCallArgs = mockRedisSet.mock.calls[0];
        expect(redisCallArgs[0]).toBe(`preview:${jobData.sessionId}`);
        expect(JSON.parse(redisCallArgs[1])).toEqual(expectedPreviewResult);
        expect(redisCallArgs[2]).toBe('EX');
        expect(redisCallArgs[3]).toBe(1800);

        expect(mockUnlink).toHaveBeenCalledTimes(2);
        expect(result.message).toContain('1/2 files');
        expect(result.finalEventCount).toBe(1);
        expect(result.warningCount).toBe(0);
        expect(result.errorCount).toBe(1);
        expect(mockLogger.error).toHaveBeenCalledWith(expect.objectContaining({ err: aiError }), expect.stringContaining("Error processing file."));
    });


    it('should throw error and not save to Redis if all files fail processing', async () => {
        const job = createMockJob(baseJobData);
        const fileError = new Error('Cannot read file');

        mockReadFile.mockRejectedValue(fileError);
        mockUnlink.mockResolvedValue(undefined);

        await expect(processAiJob(job, mockRedisClient, mockLogger))
            .rejects.toThrow(/AI processing failed for all 1 files/);

        expect(mockReadFile).toHaveBeenCalledOnce();
        expect(mockExtractSchedule).not.toHaveBeenCalled();
        expect(mockRedisSet).not.toHaveBeenCalled();
        expect(mockUnlink).toHaveBeenCalledOnce();
        expect(mockLogger.error).toHaveBeenCalledWith(expect.objectContaining({ err: fileError }), expect.stringContaining("Error processing file."));
        expect(mockLogger.error).toHaveBeenCalledWith(expect.objectContaining({ errors: expect.any(Array) }), expect.stringContaining("AI processing failed for all files"));
    });

    it('should log warning for invalid date format, save null date, and report warning', async () => {
        const job = createMockJob(baseJobData);
        const mockFileData = Buffer.from('data');
        const invalidAiResponse = {
            termStartDate: 'bad-date', termEndDate: '2024-12-31',
            scheduleEvents: [{ courseCode: 'OK101', days: ['Wed'], startTime: '10:00 AM', endTime: '11:00 AM', courseName: null, sectionDetails: null, location: null }]
        };
        const expectedScheduleData: ScheduleData = {
            termStartDate: null,
            termEndDate: '2024-12-31',
            scheduleEvents: [{ courseCode: 'OK101', days: ['Wed'], startTime: '10:00 AM', endTime: '11:00 AM', courseName: null, sectionDetails: null, location: null }]
        };
        const expectedPreviewResult: PreviewResult = {
            scheduleData: expectedScheduleData,
            processingWarnings: [
                expect.objectContaining({
                    filename: baseJobData.originalFilenames[0],
                    message: expect.stringContaining("Term start date from AI has invalid format"),
                    field: 'termStartDate',
                    value: 'bad-date'
                })
            ],
            processingErrors: []
        };

        mockReadFile.mockResolvedValue(mockFileData);
        mockExtractSchedule.mockResolvedValue(invalidAiResponse);
        mockUnlink.mockResolvedValue(undefined);
        mockRedisSet.mockResolvedValue('OK');

        const result = await processAiJob(job, mockRedisClient, mockLogger);

        expect(result.message).toContain('Processed 1/1 files.');
        expect(result.finalEventCount).toBe(1);
        expect(result.warningCount).toBe(1);
        expect(result.errorCount).toBe(0);

        expect(mockLogger.warn).toHaveBeenCalledWith(expect.objectContaining({ date: 'bad-date' }), expect.stringContaining("Term start date from AI has invalid format"));
        expect(mockRedisSet).toHaveBeenCalledOnce();
        const redisArgs = mockRedisSet.mock.calls[0];
        expect(redisArgs[0]).toBe(`preview:${baseJobData.sessionId}`);
        expect(JSON.parse(redisArgs[1])).toEqual(expectedPreviewResult);
        expect(redisArgs[2]).toBe('EX');
        expect(redisArgs[3]).toBe(1800);
        expect(mockLogger.error).not.toHaveBeenCalledWith(expect.anything(), expect.stringContaining("FAILED final validation"));
    });

    it('should log critical error if temp file deletion fails but complete successfully', async () => {
        const job = createMockJob(baseJobData);
        const mockFileData = Buffer.from('data');
        const mockAiResponse = {
            termStartDate: '2024-01-10', termEndDate: '2024-05-15',
            scheduleEvents: [{ courseCode: 'CS101', days: ['Mon'], startTime: '10:00 AM', endTime: '11:00 AM', courseName: null, sectionDetails: null, location: null }]
        };
        const unlinkError = new Error('Permission denied');
        const expectedScheduleData: ScheduleData = {
            termStartDate: '2024-01-10', termEndDate: '2024-05-15',
            scheduleEvents: [{ courseCode: 'CS101', days: ['Mon'], startTime: '10:00 AM', endTime: '11:00 AM', courseName: null, sectionDetails: null, location: null }]
        };
        const expectedPreviewResult: PreviewResult = {
            scheduleData: expectedScheduleData,
            processingWarnings: [],
            processingErrors: []
        };

        mockReadFile.mockResolvedValue(mockFileData);
        mockExtractSchedule.mockResolvedValue(mockAiResponse);
        mockRedisSet.mockResolvedValue('OK');
        mockUnlink.mockRejectedValue(unlinkError);

        const result = await processAiJob(job, mockRedisClient, mockLogger);

        expect(result.message).toContain('Processed 1/1 files.');
        expect(result.warningCount).toBe(0);
        expect(result.errorCount).toBe(0);

        expect(mockRedisSet).toHaveBeenCalledOnce();
        const redisArgs = mockRedisSet.mock.calls[0];
        expect(JSON.parse(redisArgs[1])).toEqual(expectedPreviewResult);

        expect(mockLogger.error).toHaveBeenCalledWith(expect.objectContaining({ err: unlinkError }), expect.stringContaining("!!! CRITICAL: Failed to delete temporary file !!!"));
    });

    it('should throw error if saving to Redis fails', async () => {
        const job = createMockJob(baseJobData);
        const mockFileData = Buffer.from('data');
        const mockAiResponse = {
            termStartDate: '2024-01-10', termEndDate: '2024-05-15',
            scheduleEvents: [{ courseCode: 'CS101', days: ['Mon'], startTime: '10:00 AM', endTime: '11:00 AM', courseName: null, sectionDetails: null, location: null }]
        };
        const redisError = new Error('Redis connection lost');

        mockReadFile.mockResolvedValue(mockFileData);
        mockExtractSchedule.mockResolvedValue(mockAiResponse);
        mockUnlink.mockResolvedValue(undefined);
        mockRedisSet.mockRejectedValue(redisError);

        await expect(processAiJob(job, mockRedisClient, mockLogger))
            .rejects.toThrow(/Failed to save final schedule data to Redis/);

        expect(mockRedisSet).toHaveBeenCalledOnce();
        expect(mockLogger.error).toHaveBeenCalledWith(expect.objectContaining({ err: redisError }), expect.stringContaining("!!! Failed to store final preview data in Redis !!!"));
    });
});
