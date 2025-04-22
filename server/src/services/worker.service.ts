import fs from 'fs/promises';
import { Job } from 'bullmq';
import Redis from 'ioredis';
import { FastifyBaseLogger } from 'fastify';


import { extractScheduleFromImage } from './ai.service';


import { scheduleDataSchema, scheduleEventSchema } from '@emporte/common';
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



            let validatedEventsFromFile: z.infer<typeof scheduleEventSchema>[] = [];
            const timeRegex = /\d{1,2}:\d{2}\s*(AM|PM)/i;

            if (aiResult && Array.isArray(aiResult.scheduleEvents)) {
                let originalEventCount = aiResult.scheduleEvents.length;
                validatedEventsFromFile = aiResult.scheduleEvents.filter((event: any) => {
                    try {

                        scheduleEventSchema.parse(event);
                        return true;
                    } catch(eventValidationError) {
                        if (eventValidationError instanceof ZodError) {
                            fileLog.warn({ event, errors: eventValidationError.issues }, "Filtering out invalid event from AI result.");
                        } else {
                            fileLog.warn({ event, error: eventValidationError }, "Filtering out event due to unexpected validation error.");
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
                        fileLog.warn({ date: aiResult.termStartDate }, "Term start date from AI has invalid format, ignoring.");
                    }
                }
                if (!termEndDate && aiResult.termEndDate && typeof aiResult.termEndDate === 'string') {
                    if (/^\d{4}-\d{2}-\d{2}$/.test(aiResult.termEndDate)) {
                        termEndDate = aiResult.termEndDate;
                        fileLog.info({ termEndDate }, "Captured term end date from file.");
                    } else {
                        fileLog.warn({ date: aiResult.termEndDate }, "Term end date from AI has invalid format, ignoring.");
                    }
                }

            } else {
                fileLog.warn("AI result missing or has invalid scheduleEvents array.");

                fileProcessingErrors.push({ filename: originalFilename, error: "AI result format invalid (missing scheduleEvents array)" });
            }

            filesProcessedSuccessfully++;
            fileLog.info(`Successfully processed file.`);

        } catch (error: any) {
            fileLog.error({ err: error }, `Error processing file.`);
            fileProcessingErrors.push({ filename: originalFilename, error: error.message || 'Unknown processing error' });

        } finally {

            try {
                await fs.unlink(tempFilePath);
                fileLog.info(`Successfully deleted temporary file.`);
            } catch (unlinkError: any) {


                fileLog.error({ err: unlinkError }, `!!! CRITICAL: Failed to delete temporary file !!!`);
            }
        }
    }


    log.info({ successCount: filesProcessedSuccessfully, errorCount: fileProcessingErrors.length }, "Finished processing all files in job.");

    if (filesProcessedSuccessfully === 0) {
        log.error({ errors: fileProcessingErrors }, "AI processing failed for all files in the job.");

        throw new Error(`AI processing failed for all ${tempFilePaths.length} files. Errors: ${JSON.stringify(fileProcessingErrors)}`);
    }


    const combinedScheduleData = {
        termStartDate: termStartDate,
        termEndDate: termEndDate,
        scheduleEvents: allScheduleEvents,
    };


    let validatedData: z.infer<typeof scheduleDataSchema>;
    try {
        validatedData = scheduleDataSchema.parse(combinedScheduleData);
        log.info({ eventCount: validatedData.scheduleEvents.length }, "Combined schedule data passed final Zod validation.");
    } catch (error) {
        if (error instanceof ZodError) {
            log.error({ errors: error.issues, finalData: combinedScheduleData }, "Combined schedule data FAILED final validation.");
            throw new Error(`Combined schedule data is invalid after processing: ${error.errors.map(e => e.message).join(', ')}`);
        }
        log.error({ err: error, finalData: combinedScheduleData }, "Unexpected error during final validation.");
        throw new Error("Failed to validate combined schedule data due to an unexpected error.");
    }


    const redisKey = `preview:${sessionId}`;
    try {

        await redisClient.set(redisKey, JSON.stringify(validatedData), 'EX', 1800);
        log.info({ key: redisKey, eventCount: validatedData.scheduleEvents.length }, 'Stored final validated schedule data in Redis.');
    } catch (redisError: any) {
        log.error({ err: redisError, key: redisKey }, '!!! Failed to store final preview data in Redis !!!');

        throw new Error(`Failed to save final schedule data to Redis: ${redisError.message}`);
    }

    log.info(`--- Successfully completed AI processing job ---`);

    return {
        message: `Processed ${filesProcessedSuccessfully}/${tempFilePaths.length} files successfully.`,
        finalEventCount: validatedData.scheduleEvents.length,
        errors: fileProcessingErrors,
    };
};
