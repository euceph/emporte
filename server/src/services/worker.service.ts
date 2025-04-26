import fs from 'fs/promises';
import { Job } from 'bullmq';
import Redis from 'ioredis';
import { FastifyBaseLogger } from 'fastify';
import { extractScheduleFromImage } from './ai.service';
import { scheduleDataSchema, scheduleEventSchema, previewResultSchema, type ProcessingError, type ProcessingWarning, type ScheduleData, type ScheduleEvent } from '@emporte/common';
import { ZodError, z } from 'zod';


export interface AiJobData {
    sessionId: string;
    tempFilePaths: string[];
    mimeTypes: string[];
    originalFilenames: string[];
}

/**
 * processes a job from the AI processing queue
 * reads image files from temp paths, calls AI service, combines results,
 * validates, stores in Redis, and cleans up temp files
 *
 * @param job BullMQ job object
 * @param redisClient an initialized ioredis client instance
 * @param logger logger instance
 */
export const processAiJob = async (job: Job<AiJobData>, redisClient: Redis, logger: FastifyBaseLogger) => {
    const { sessionId, tempFilePaths, mimeTypes, originalFilenames } = job.data;
    const log = logger.child({ jobId: job.id, sessionId, fileCount: tempFilePaths.length });

    log.info(`--- Starting AI processing job ---`);


    const allScheduleEvents: z.infer<typeof scheduleEventSchema>[] = [];
    let termStartDate: string | null = null;
    let termEndDate: string | null = null;
    let filesProcessedSuccessfully = 0;
    const fileProcessingErrors: { filename: string; error: string }[] = [];
    const processingWarnings: ProcessingWarning[] = [];


    for (let i = 0; i < tempFilePaths.length; i++) {
        const tempFilePath = tempFilePaths[i];
        const mimeType = mimeTypes[i];
        const originalFilename = originalFilenames[i];
        const fileLog = log.child({ filename: originalFilename, path: tempFilePath });

        fileLog.info(`Processing file...`);

        try {

            const fileBuffer = await fs.readFile(tempFilePath);


            const base64Data = fileBuffer.toString('base64');
            fileLog.info(`Read file and converted to base64 (length: ${base64Data.length})`);


            const aiResult = await extractScheduleFromImage(
                base64Data,
                mimeType,
                fileLog,
                originalFilename
            );


            let validatedEventsFromFile: ScheduleEvent[] = [];
            if (aiResult && Array.isArray(aiResult.scheduleEvents)) {
                let originalEventCount = aiResult.scheduleEvents.length;
                validatedEventsFromFile = aiResult.scheduleEvents.filter((event: any) => {
                    try {
                        scheduleEventSchema.parse(event);
                        return true;
                    } catch (eventValidationError) {
                        const warningMsg = "Filtering out invalid event from AI result.";
                        if (eventValidationError instanceof ZodError) {
                            fileLog.warn({ event, errors: eventValidationError.issues }, warningMsg);
                        } else {
                            fileLog.warn({ event, error: eventValidationError }, warningMsg);
                        }
                        return false;
                    }
                });
                fileLog.info({ originalCount: originalEventCount, validCount: validatedEventsFromFile.length }, `Validated events from AI result for file.`);
                allScheduleEvents.push(...validatedEventsFromFile);

                if (!termStartDate && aiResult.termStartDate && typeof aiResult.termStartDate === 'string') {
                    if (/^\d{4}-\d{2}-\d{2}$/.test(aiResult.termStartDate)) {
                        termStartDate = aiResult.termStartDate;
                        fileLog.info({ termStartDate }, "Captured term start date from file.");
                    } else {
                        const warningMsg = "Term start date from AI has invalid format (YYYY-MM-DD expected), ignoring value.";
                        fileLog.warn({ date: aiResult.termStartDate }, warningMsg);
                        processingWarnings.push({
                            filename: originalFilename,
                            message: warningMsg,
                            field: 'termStartDate',
                            value: aiResult.termStartDate
                        });
                    }
                }
                if (!termEndDate && aiResult.termEndDate && typeof aiResult.termEndDate === 'string') {
                    if (/^\d{4}-\d{2}-\d{2}$/.test(aiResult.termEndDate)) {
                        termEndDate = aiResult.termEndDate;
                        fileLog.info({ termEndDate }, "Captured term end date from file.");
                    } else {
                        const warningMsg = "Term end date from AI has invalid format (YYYY-MM-DD expected), ignoring value.";
                        fileLog.warn({ date: aiResult.termEndDate }, warningMsg);
                        processingWarnings.push({
                            filename: originalFilename,
                            message: warningMsg,
                            field: 'termEndDate',
                            value: aiResult.termEndDate
                        });
                    }
                }

            } else {
                const errorMsg = "AI result format invalid (missing or invalid scheduleEvents array)";
                fileLog.warn(errorMsg);
                fileProcessingErrors.push({ filename: originalFilename, error: errorMsg });
            }
            filesProcessedSuccessfully++;
            fileLog.info(`Successfully processed file.`);
        } catch (error: any) {
            const errorMsg = error.message || 'Unknown processing error';
            fileLog.error({ err: error }, `Error processing file.`);
            fileProcessingErrors.push({ filename: originalFilename, error: errorMsg });
        } finally {
            try {
                await fs.unlink(tempFilePath);
                fileLog.info(`Successfully deleted temporary file.`);
            } catch (unlinkError: any) {
                fileLog.error({ err: unlinkError }, `!!! CRITICAL: Failed to delete temporary file !!!`);
            }
        }
    }

    log.info({ successCount: filesProcessedSuccessfully, errorCount: fileProcessingErrors.length, warningCount: processingWarnings.length }, "Finished processing all files in job.");

    if (filesProcessedSuccessfully === 0 && tempFilePaths.length > 0) {
        log.error({ errors: fileProcessingErrors }, "AI processing failed for all files in the job.");
        throw new Error(`AI processing failed for all ${tempFilePaths.length} files. Errors: ${JSON.stringify(fileProcessingErrors)}`);
    }

    const combinedScheduleData = {
        termStartDate: termStartDate,
        termEndDate: termEndDate,
        scheduleEvents: allScheduleEvents,
    };


    let validatedScheduleData: ScheduleData;
    try {
        validatedScheduleData = scheduleDataSchema.parse(combinedScheduleData);
        log.info({ eventCount: validatedScheduleData.scheduleEvents.length }, "Combined schedule data passed core Zod validation.");
    } catch (error) {
        const baseMsg = "Combined schedule data is invalid after processing";
        if (error instanceof ZodError) {
            const errorDetails = error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ');
            log.error({ errors: error.issues, finalData: combinedScheduleData }, `${baseMsg}: ${errorDetails}`);
            fileProcessingErrors.push({ filename: 'Combined Data', error: `${baseMsg}: ${errorDetails}` });
            throw new Error(`${baseMsg}: ${errorDetails}`);
        } else {
            log.error({ err: error, finalData: combinedScheduleData }, `Unexpected error during final validation: ${baseMsg}`);
            throw new Error(`Failed to validate combined schedule data due to an unexpected error.`);
        }
    }

    const previewResultData = {
        scheduleData: validatedScheduleData,
        processingWarnings: processingWarnings,
        processingErrors: fileProcessingErrors
    };

    let validatedPreviewResult: z.infer<typeof previewResultSchema>;
    try {
        validatedPreviewResult = previewResultSchema.parse(previewResultData);
        log.info("Final PreviewResult structure passed validation.");
    } catch (error) {
        log.error({ err: error, previewResultData }, "!!! CRITICAL: Assembled PreviewResult failed schema validation !!!");
        validatedPreviewResult = previewResultData;
    }

    const redisKey = `preview:${sessionId}`;
    try {
        await redisClient.set(redisKey, JSON.stringify(validatedPreviewResult), 'EX', 1800);
        log.info({ key: redisKey, eventCount: validatedPreviewResult.scheduleData.scheduleEvents.length, warningCount: validatedPreviewResult.processingWarnings.length, errorCount: validatedPreviewResult.processingErrors.length }, 'Stored final preview result in Redis.');
    } catch (redisError: any) {
        log.error({ err: redisError, key: redisKey }, '!!! Failed to store final preview data in Redis !!!');
        throw new Error(`Failed to save final schedule data to Redis: ${redisError.message}`);
    }

    log.info(`--- Successfully completed AI processing job ---`);

    return {
        message: `Processed ${filesProcessedSuccessfully}/${tempFilePaths.length} files.`,
        finalEventCount: validatedPreviewResult.scheduleData.scheduleEvents.length,
        warningCount: validatedPreviewResult.processingWarnings.length,
        errorCount: validatedPreviewResult.processingErrors.length
    };
};
