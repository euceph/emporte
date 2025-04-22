import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import fp from 'fastify-plugin';
import fastifyCors from '@fastify/cors';

async function cors_plugin(fastify: FastifyInstance, options: FastifyPluginOptions) {
    const logger = fastify.log.child({ plugin: 'CORS' });
    logger.info('Registering CORS plugin...');
    await fastify.register(fastifyCors, {
        origin: process.env.CLIENT_BASE_URL || true,
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    });
    logger.info('Registered fastifyCors.');
}

export default fp(cors_plugin, { name: 'emporte-cors' });
