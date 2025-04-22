import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import fp from 'fastify-plugin';
import IORedis from 'ioredis';


function initializeRedisClient(logger: FastifyInstance['log']): IORedis {
    const redisUrl = process.env.REDIS_URL as string;
    if (!redisUrl) {
        logger.fatal('REDIS_URL environment variable is not set.');
        process.exit(1);
    }
    const redisClient = new IORedis(redisUrl, {
        maxRetriesPerRequest: null,
        connectTimeout: 10000,
        tls: redisUrl.startsWith('rediss://') ? {} : undefined,
        enableReadyCheck: true,
    });

    redisClient.on('error', (err: Error) => logger.error({ err }, 'Redis Client Error'));
    redisClient.on('connect', () => logger.info('Redis client connecting...'));
    redisClient.on('ready', () => logger.info('Redis client ready.'));

    redisClient.on('reconnecting', (delay: number) => logger.warn({ delay }, 'Redis client reconnecting...'));
    redisClient.on('end', () => logger.warn('Redis client connection ended.'));

    return redisClient;
}


async function redis_plugin(fastify: FastifyInstance, options: FastifyPluginOptions) {
    const logger = fastify.log.child({ plugin: 'Redis' });
    logger.info('Initializing Redis client...');

    const redisClient = initializeRedisClient(logger);


    fastify.decorate('redis', redisClient);
    logger.info('Redis client initialized and decorated onto Fastify instance.');


    fastify.addHook('onClose', async (instance) => {
        instance.log.info('Closing Redis connection...');
        await redisClient.quit();
        instance.log.info('Redis connection closed.');
    });
}


export default fp(redis_plugin, {
    name: 'emporte-redis'
});
