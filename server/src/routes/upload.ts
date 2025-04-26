import { FastifyInstance, FastifyPluginOptions, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import path from 'path';
import fs from 'fs';
import fsPromises from 'fs/promises';
import { pipeline } from 'stream/promises';
import { randomUUID } from 'node:crypto';
import { Queue } from 'bullmq';
import { AiJobData } from '../services/worker.service';

async function upload_routes(fastify: FastifyInstance, options: FastifyPluginOptions) {
    const TEMP_UPLOAD_DIR = path.resolve(process.env.TEMP_DIR || '/tmp/emporte-uploads');
    if (!fastify.aiProcessingQueue) {
        throw new Error("aiProcessingQueue decorator is not available. Ensure BullMQ plugin is registered before upload routes.");
    }

    const aiProcessingQueue = fastify.aiProcessingQueue as Queue<AiJobData>;

    fastify.post('/api/upload', {
        config: {
            rateLimit: {
                max: parseInt(process.env.UPLOAD_RATE_LIMIT_MAX || '10', 10),
                timeWindow: process.env.UPLOAD_RATE_LIMIT_WINDOW || '5 minutes',
            }
        }
    }, async (request: FastifyRequest, reply: FastifyReply) => {
        const log = request.log.child({ handler: '/api/upload' });
        log.info('--- Entered /api/upload handler ---');
        if (!request.session?.googleTokens?.accessToken || Date.now() >= request.session.googleTokens.expiresAt) {
            log.warn('Upload blocked: Invalid session or token expired.');
            await request.session?.destroy(); reply.clearCookie('sessionId', { path: '/' });
            return reply.code(401).send({ success: false, error: 'Unauthorized', message: 'Invalid session or token expired. Please log in again.' });
        }
        log.info('Auth check passed for upload.');

        const MAX_FILES = parseInt(process.env.MAX_FILE_COUNT || '4', 10);
        const fileInfos: { originalFilename: string; tempFilePath: string; mimeType?: string; savePromise: Promise<void>; error?: string; }[] = [];
        let filesProcessedCount = 0;
        const tempFilesToClean: string[] = [];

        try {
            log.info('Processing multipart request...');
            const parts = request.parts();
            for await (const part of parts) {
                if (part.type === 'field') { log.info(`Ignoring field: ${part.fieldname}`); }
                else if (part.type === 'file' && part.fieldname === 'files') {
                    log.info(`Processing file: ${part.filename} (${part.mimetype})`);
                    if (!part.filename) { log.warn("Skipping file part with no filename."); await part.file.resume(); continue; }
                    if (filesProcessedCount >= MAX_FILES) { log.warn(`File limit (${MAX_FILES}) reached. Ignoring extra file: ${part.filename}`); await part.file.resume(); continue; }
                    filesProcessedCount++;
                    const fileExtension = path.extname(part.filename) || '.tmp';
                    const uniqueFilename = `${randomUUID()}${fileExtension}`;
                    const tempFilePath = path.join(TEMP_UPLOAD_DIR, uniqueFilename);
                    log.info(`Saving to temporary path: ${tempFilePath}`);
                    const savePromise = pipeline(part.file, fs.createWriteStream(tempFilePath))
                        .catch(saveError => {
                            log.error({ err: saveError, tempFilePath, filename: part.filename }, `Local file save failed.`);
                            fsPromises.unlink(tempFilePath).catch((e: any) => log.warn({ err: e }, 'Failed attempt to clean partial file after save error.'));
                            throw saveError;
                        });
                    fileInfos.push({ originalFilename: part.filename, tempFilePath: tempFilePath, mimeType: part.mimetype, savePromise: savePromise });
                } else {
                    log.warn(`Ignoring unexpected part: type=${part.type}, fieldname=${part.fieldname}`);
                    if (part.type === 'file') await part.file.resume();
                }
            }
            log.info('Finished processing parts.');

            if (fileInfos.length === 0) { log.error('No valid schedule files uploaded.'); return reply.code(400).send({ success: false, error: 'Bad Request', message: 'No schedule files uploaded.' }); }

            log.info(`Waiting for ${fileInfos.length} local file saves...`);
            const saveResults = await Promise.allSettled(fileInfos.map(f => f.savePromise));
            const successfulSaves = fileInfos.filter((f, index) => {
                const result = saveResults[index];
                if (result.status === 'rejected') {
                    f.error = `Local Save Failed: ${result.reason?.message || 'Unknown reason'}`;
                    log.error({ err: result.reason, tempFilePath: f.tempFilePath, filename: f.originalFilename }, `Save failed for file`);
                    return false;
                } else {
                    log.info({ tempFilePath: f.tempFilePath, filename: f.originalFilename }, `Local save succeeded`);
                    tempFilesToClean.push(f.tempFilePath);
                    return true;
                }
            });

            if (successfulSaves.length === 0) { log.error("All local file saves failed."); throw new Error("Could not save any uploaded files locally."); }

            const sessionId = request.session.sessionId;
            if (!sessionId) { log.error("Critical: Session ID missing after auth check."); throw new Error("Session ID not found, cannot process upload."); }

            const jobData: AiJobData = {
                sessionId: sessionId,
                tempFilePaths: successfulSaves.map(f => f.tempFilePath),
                originalFilenames: successfulSaves.map(f => f.originalFilename),
                mimeTypes: successfulSaves.map(f => f.mimeType || 'application/octet-stream'),
            };

            log.info({ fileCount: jobData.tempFilePaths.length, sessionId }, "Queuing AI processing job...");
            try {
                const job = await fastify.aiProcessingQueue.add('process-images', jobData);
                log.info({ jobId: job.id, sessionId, fileCount: jobData.tempFilePaths.length }, `Successfully queued AI processing job.`);
                tempFilesToClean.length = 0;
            } catch (queueError: any) {
                log.error({ err: queueError, sessionId }, "!!! Failed to queue AI processing job !!!");
                throw new Error(`Failed to queue processing job: ${queueError.message}`);
            }

            log.info("Responding to client immediately after queueing job.");
            return reply.send({ success: true, message: `Upload received for ${successfulSaves.length} file(s). Processing started in the background.` });

        } catch (err: unknown) {
            log.error({ err }, "!!! Error during /api/upload processing !!!");
            if (tempFilesToClean.length > 0) {
                log.warn({ count: tempFilesToClean.length }, "Attempting to clean up temporary files due to error...");
                const cleanupPromises = tempFilesToClean.map(filePath =>
                    fsPromises.unlink(filePath).catch((e: any) => log.error({ err: e, path: filePath }, "Failed to delete temp file during error cleanup"))
                );
                await Promise.allSettled(cleanupPromises);
                log.info("Temporary file cleanup attempt finished.");
            }
            throw err;
        }
    });
}

export default fp(upload_routes);