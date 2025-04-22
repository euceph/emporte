import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import fp from 'fastify-plugin';
import fastifyOAuth2 from '@fastify/oauth2';

async function oauth2_plugin(fastify: FastifyInstance, options: FastifyPluginOptions) {
    const logger = fastify.log.child({ plugin: 'OAuth2' });
    logger.info('Registering OAuth2 plugin...');


    const googleClientId = process.env.GOOGLE_CLIENT_ID;
    const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const serverBaseUrl = process.env.SERVER_BASE_URL;

    if (!googleClientId || !googleClientSecret || !serverBaseUrl) {
        logger.fatal('Missing required Google OAuth environment variables!');
        throw new Error('Missing Google OAuth environment variables.');
    }

    await fastify.register(fastifyOAuth2, {
        name: 'googleOAuth2',
        scope: ['profile', 'email', 'https://www.googleapis.com/auth/calendar.events'],
        credentials: {
            client: {
                id: googleClientId,
                secret: googleClientSecret,
            },
            auth: fastifyOAuth2.GOOGLE_CONFIGURATION,
        },
        startRedirectPath: '/auth/google',
        callbackUri: `${serverBaseUrl}/auth/google/callback`,
    });
    logger.info('Registered fastifyOAuth2.');
}


export default fp(oauth2_plugin, { name: 'emporte-oauth2' });