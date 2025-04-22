import { FastifyInstance, FastifyPluginOptions, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import fastifyRateLimit from '@fastify/rate-limit';

async function rate_limit_plugin(fastify: FastifyInstance, options: FastifyPluginOptions) {
    const logger = fastify.log.child({ plugin: 'RateLimit' });
    logger.info('Registering Rate Limit plugin...');


    if (!fastify.redis) {
        throw new Error("Redis plugin must be registered before the rate limit plugin.");
    }
    const redisClient = fastify.redis;

    await fastify.register(fastifyRateLimit, {
        global: true,
        max: parseInt(process.env.GLOBAL_RATE_LIMIT_MAX || '100', 10),
        timeWindow: process.env.GLOBAL_RATE_LIMIT_WINDOW || '1 minute',
        redis: redisClient,
        keyGenerator: (request: FastifyRequest) => {

            if (request.session?.sessionId) return request.session.sessionId;

            return request.ip;
        },
        allowList: process.env.RATE_LIMIT_ALLOW_LIST ? process.env.RATE_LIMIT_ALLOW_LIST.split(',') : [],
        skipOnError: false,
        addHeadersOnExceeding: {
            'x-ratelimit-limit': true,
            'x-ratelimit-remaining': true,
            'x-ratelimit-reset': true
        },
        addHeaders: {
            'x-ratelimit-limit': true,
            'x-ratelimit-remaining': true,
            'x-ratelimit-reset': true,
            'retry-after': true
        },
    });
    logger.info('Registered @fastify/rate-limit plugin with Redis store.');
}

export default fp(rate_limit_plugin, {
    name: 'emporte-rate-limit',
    dependencies: ['emporte-redis']
});