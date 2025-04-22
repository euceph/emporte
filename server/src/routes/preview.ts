import { FastifyInstance, FastifyPluginOptions, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import IORedis from 'ioredis';
import { z } from 'zod';
import { scheduleDataSchema } from '@emporte/common';

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
            const storedData = await redisClient.get(redisKey);
            if (!storedData) {
                log.warn({ key: redisKey }, 'No preview data found in Redis.');
                return reply.code(404).send({ success: false, error: 'Not Found', message: 'Preview data not found or expired. Please upload again.' });
            }
            let parsedScheduleData: z.infer<typeof scheduleDataSchema>;
            try {
                parsedScheduleData = JSON.parse(storedData);
                if (typeof parsedScheduleData !== 'object' || !Array.isArray(parsedScheduleData.scheduleEvents)) throw new Error("Stored data is not in expected format.");
                log.info({ key: redisKey, eventCount: parsedScheduleData.scheduleEvents.length }, 'Successfully retrieved and parsed schedule data.');
            } catch (parseError: any) {
                log.error({ err: parseError, key: redisKey }, 'Failed to parse stored preview data.');
                await redisClient.del(redisKey).catch((e: any) => log.error({err:e, key: redisKey}, "Failed deleting corrupted redis key"));
                return reply.code(500).send({ success: false, error: 'Internal Server Error', message: `Failed to read preview data.` });
            }
            log.info({ key: redisKey }, 'Sending scheduleData to client.');
            return reply.send({ success: true, scheduleData: parsedScheduleData });
        } catch (err: any) {
            log.error({ err, key: redisKey }, '!!! Error retrieving preview data from Redis !!!');
            throw err;
        }
    });


    fastify.delete('/api/preview/delete', async (request: FastifyRequest, reply: FastifyReply) => {
        const log = request.log.child({ handler: '/api/preview/delete' });
        log.info('--- Entered DELETE /api/preview/delete handler ---');
        if (!request.session?.sessionId) {
            log.warn('Preview delete blocked: No valid session.');
            return reply.code(401).send({ success: false, error: 'Unauthorized', message: 'Invalid session.' });
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