import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import fp from 'fastify-plugin';
import fastifyMultipart from '@fastify/multipart';

async function multipart_plugin(fastify: FastifyInstance, options: FastifyPluginOptions) {
    const logger = fastify.log.child({ plugin: 'Multipart' });
    logger.info('Registering Multipart plugin...');
    await fastify.register(fastifyMultipart, {
        limits: {
            fileSize: parseInt(process.env.MAX_FILE_SIZE_BYTES || (10 * 1024 * 1024).toString(), 10),
            files: parseInt(process.env.MAX_FILE_COUNT || '4', 10),
        },
    });
    logger.info('Registered fastifyMultipart.');
}

export default fp(multipart_plugin, { name: 'emporte-multipart' });
