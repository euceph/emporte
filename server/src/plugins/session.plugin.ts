import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import fp from 'fastify-plugin';
import fastifyCookie from '@fastify/cookie';
import fastifySession from '@fastify/session';
import { RedisStore } from 'connect-redis';
import IORedis from 'ioredis';



function initializeSessionStore(redisClient: IORedis): RedisStore {
    return new RedisStore({ 
        client: redisClient,
        prefix: 'session:',
        ttl: parseInt(process.env.SESSION_TTL_SECONDS || (86400 * 7).toString(), 10),
    });
}


async function session_plugin(fastify: FastifyInstance, options: FastifyPluginOptions) {
    const logger = fastify.log.child({ plugin: 'Session' });
    logger.info('Setting up session management...');


    if (!fastify.redis) {
        throw new Error("Redis plugin must be registered before the session plugin.");
    }
    const redisClient = fastify.redis;


    const sessionStore = initializeSessionStore(redisClient);
    logger.info('Redis session store initialized.');



    await fastify.register(fastifyCookie);
    logger.info('Registered fastifyCookie (dependency for session).');


    await fastify.register(fastifySession, {
        store: sessionStore,
        secret: process.env.SESSION_SECRET as string,
        cookieName: 'sessionId',
        cookie: {
            secure: process.env.NODE_ENV === 'production',
            httpOnly: true,
            maxAge: parseInt(process.env.SESSION_TTL_SECONDS || (86400 * 7).toString(), 10) * 1000,
            path: '/',
            sameSite: 'lax',
        },
        saveUninitialized: false,
    });
    logger.info('Registered fastifySession with Redis store.');
}


export default fp(session_plugin, {
    name: 'emporte-session',
    dependencies: ['emporte-redis']
});