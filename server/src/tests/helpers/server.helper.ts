import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { buildServer } from '../../server';
import path from 'path';
import IORedis from 'ioredis';

const TEST_REDIS_URL = 'redis://localhost:6379/1';

interface TestLoginPayload {
    accessToken: string;
    expiresAt: number;
}

export async function buildTestServer(
    addTestRoutes?: AddErrorHandlerRoutes
): Promise<FastifyInstance> {
    process.env.NODE_ENV = 'test';

    process.env.SESSION_SECRET = 'test-session-secret-abc-123-do-not-use-in-prod';
    process.env.GOOGLE_CLIENT_ID = 'test-google-client-id';
    process.env.GOOGLE_CLIENT_SECRET = 'test-google-client-secret';
    process.env.GEMINI_API_KEY = 'test-gemini-api-key';

    process.env.SERVER_BASE_URL = 'http://localhost:3001';
    process.env.CLIENT_BASE_URL = 'http://localhost:9998';
    process.env.REDIS_URL = TEST_REDIS_URL;

    process.env.TEMP_DIR = path.resolve('/tmp/emporte-uploads-test');

    process.env.LOG_LEVEL = 'info';


    const requiredEnv = [
        'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'SESSION_SECRET',
        'SERVER_BASE_URL', 'CLIENT_BASE_URL', 'REDIS_URL', 'GEMINI_API_KEY'
    ];
    requiredEnv.forEach((varName) => {
        if (!process.env[varName]) {
            throw new Error(`FATAL: Missing required environment variable for testing: ${varName}`);
        }
    });

    console.log(`--- [Helper] Test Redis URL for direct checks: ${TEST_REDIS_URL} ---`);
    console.log(`--- [Helper] Redis URL passed to buildServer: ${process.env.REDIS_URL} ---`);

    const app = await buildServer();

    app.post('/test/login',
        {},
        async (request: FastifyRequest<{ Body: TestLoginPayload }>, reply: FastifyReply) => {
            try {
                const { accessToken, expiresAt } = request.body;
                if (!accessToken || !expiresAt) {
                    return reply.code(400).send({ error: 'Missing accessToken or expiresAt in test login payload' });
                }

                request.session.googleTokens = {
                    accessToken: accessToken,
                    expiresAt: expiresAt,
                };

                request.log.info({ reqId: request.id, sessionId: request.session.sessionId }, '--- DEBUG: BEFORE session.save() ---');
                await request.session.save();

                request.log.info({ sessionId: request.session.sessionId }, 'Test login successful, session created.');
                return reply.code(200).send({ success: true, sessionId: request.session.sessionId });

            } catch (error: any) {
                request.log.error({ err: error }, 'Error during /test/login');
                return reply.code(500).send({ error: 'Test login failed' });
            }
        }
    );
    app.log.info('Registered test-only route: POST /test/login');

    if (addTestRoutes) {
        addTestRoutes(app);
        app.log.info('Registered additional test-specific routes.');
    }

    await app.ready();

    return app;
}

export async function cleanupTestDatabase() {
    const redis = new IORedis(TEST_REDIS_URL, {
        maxRetriesPerRequest: 1
    });
    try {
        await redis.flushdb();
        console.log(`Cleaned Redis test database (connected via ${TEST_REDIS_URL})`);
    } catch (error) {
        console.error(`Error cleaning test Redis database: ${error}`);
    } finally {
        await redis.quit();
    }
}
