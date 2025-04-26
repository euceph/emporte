import { FastifyInstance, FastifyPluginOptions, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import IORedis from 'ioredis';
import { z } from 'zod';
import { previewResultSchema, type PreviewResult } from '@emporte/common';

async function preview_routes(fastify: FastifyInstance, options: FastifyPluginOptions) {

    if (!fastify.redis) {
        throw new Error("Redis client decorator ('redis') is not available. Ensure Redis plugin is registered before preview routes.");
    }
    const redisClient = fastify.redis as IORedis;

    fastify.get('/api/preview', async (request: FastifyRequest, reply: FastifyReply) => {
        const log = request.log.child({ handler: '/api/preview' });
        log.info('--- Entered /api/preview handler ---');
        if (!request.session?.sessionId || !request.session?.googleTokens?.accessToken || Date.now() >= request.session.googleTokens.expiresAt) {
            log.warn('Preview blocked: Invalid session or token expired.');
            await request.session?.destroy(); reply.clearCookie('sessionId', { path: '/' });
            return reply.code(401).send({ success: false, error: 'Unauthorized', message: 'Invalid session or token expired. Please log in again.' });
        }
        log.info('Auth check passed for preview.');

        const redisKey = `preview:${request.session.sessionId}`;
        log.info({ key: redisKey }, 'Attempting to retrieve preview data from Redis...');
        try {
            const storedDataString = await redisClient.get(redisKey);
            if (!storedDataString) {
                log.warn({ key: redisKey }, 'No preview data found in Redis.');
                return reply.code(404).send({ success: false, error: 'Not Found', message: 'Preview data not found or expired. Please upload again.' });
            }

            let parsedPreviewResult: PreviewResult;
            try {
                const jsonData = JSON.parse(storedDataString);
                const validation = previewResultSchema.safeParse(jsonData);
                if (!validation.success) {
                    log.error({ errors: validation.error.issues, key: redisKey, data: storedDataString.substring(0, 200) + '...' }, 'Stored preview data failed schema validation.');
                    throw new Error("Stored data is not in the expected PreviewResult format.");
                }
                parsedPreviewResult = validation.data;
                log.info({ key: redisKey, eventCount: parsedPreviewResult.scheduleData.scheduleEvents.length, warningCount: parsedPreviewResult.processingWarnings.length, errorCount: parsedPreviewResult.processingErrors.length }, 'Successfully retrieved and validated preview result.');

            } catch (parseOrValidationError: any) {
                log.error({ err: parseOrValidationError, key: redisKey }, 'Failed to parse or validate stored preview data.');
                await redisClient.del(redisKey).catch((e: any) => log.error({ err: e, key: redisKey }, "Failed deleting corrupted redis key"));
                return reply.code(500).send({ success: false, error: 'Internal Server Error', message: `Failed to read preview data.` });
            }

            log.info({ key: redisKey }, 'Sending previewResult to client.');
            return reply.send({ success: true, previewResult: parsedPreviewResult });

        } catch (err: any) {
            log.error({ err, key: redisKey }, '!!! Error retrieving preview data from Redis !!!');
            throw err;
        }
    });


    fastify.delete('/api/preview/delete', async (request: FastifyRequest, reply: FastifyReply) => {
        const log = request.log.child({ handler: '/api/preview/delete' });
        log.info('--- Entered DELETE /api/preview/delete handler ---');
        if (!request.session?.sessionId || !request.session?.googleTokens?.accessToken || Date.now() >= request.session.googleTokens.expiresAt) {
            log.warn('Preview delete blocked: Invalid session or token expired.');
            await request.session?.destroy(); reply.clearCookie('sessionId', { path: '/' });
            return reply.code(401).send({ success: false, error: 'Unauthorized', message: 'Invalid session or token expired. Please log in again.' });
        }
        const sessionId = request.session.sessionId;
        log.info('Auth check passed for preview delete.');
        const redisKey = `preview:${sessionId}`;
        try {
            log.info({ key: redisKey }, "Attempting deletion of Redis preview key.");

            const delCount = await redisClient.del(redisKey);
            if (delCount > 0) log.info({ key: redisKey, count: delCount }, 'Redis preview key deleted.');
            else log.warn({ key: redisKey }, 'Redis preview key not found for deletion.');
        } catch (redisDelError: any) {
            log.error({ err: redisDelError, key: redisKey }, 'Failed to delete Redis key.');
        }
        log.info("Preview data cleanup process finished.");
        return reply.code(204).send();
    });
}

export default fp(preview_routes);