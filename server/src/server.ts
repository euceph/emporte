import path from 'path';
import fsPromises from 'fs/promises';
import { Queue } from 'bullmq';
import fastify, {FastifyInstance, FastifyError, FastifyBaseLogger} from 'fastify';
import { OAuth2Namespace } from '@fastify/oauth2';
import { AiJobData } from "./services/worker.service";
import auth_routes from "./routes/auth";
import upload_routes from "./routes/upload";
import preview_routes from "./routes/preview";
import calendar_routes from "./routes/calendar";
import redis_plugin from './plugins/redis.plugin';
import session_plugin from './plugins/session.plugin';
import cors_plugin from "./plugins/cors.plugin";
import oauth2_plugin from "./plugins/oauth2.plugin";
import multipart_plugin from "./plugins/multipart.plugin";
import rate_limit_plugin from "./plugins/rate_limit.plugin";
import bullmq_plugin from "./plugins/bullmq.plugin";
import { ZodError } from 'zod';
import dotenv from 'dotenv';
import cron from 'node-cron';
import IORedis from "ioredis";


dotenv.config();


const requiredEnv = [
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'SESSION_SECRET',
    'SERVER_BASE_URL',
    'CLIENT_BASE_URL',
    'REDIS_URL',
    'GEMINI_API_KEY',
];
requiredEnv.forEach((varName) => {
    if (!process.env[varName]) {
        console.error(`Error: Missing required environment variable ${varName}`);
        process.exit(1);
    }
});


interface GoogleTokens {
    accessToken: string;
    refreshToken?: string;
    expiresAt: number;
}

declare module '@fastify/session' {
    interface FastifySessionObject {
        googleTokens?: GoogleTokens;
    }
}

declare module 'fastify' {
    interface FastifyInstance {
        googleOAuth2: OAuth2Namespace;
        aiProcessingQueue: Queue<AiJobData>;
        redis: IORedis;
    }
}

const TEMP_UPLOAD_DIR = path.resolve(process.env.TEMP_DIR || '/tmp/emporte-uploads');
const MAX_FILE_AGE_HOURS = parseInt(process.env.TEMP_FILE_MAX_AGE_HOURS || '24', 10);

async function setupTemporaryDirectory(dirPath: string, logger: FastifyInstance['log']): Promise<void> {
    try {
        await fsPromises.mkdir(dirPath, { recursive: true });
        logger.info(`Temporary upload directory ensured: ${dirPath}`);
    } catch (error: any) {
        logger.error({ err: error, directory: dirPath }, `!!! CRITICAL ERROR: Failed to create temporary directory !!!`);
        // process.exit(1);
    }
}

/**
 * scans the temporary upload directory and deletes files older than MAX_FILE_AGE_HOURS
 * @param logger - logger instance (e.g., server.log)
 */
async function cleanupOldTempFiles(logger: FastifyBaseLogger): Promise<void> {
    const logContext = { directory: TEMP_UPLOAD_DIR, maxAgeHours: MAX_FILE_AGE_HOURS };

    logger.info(logContext, `Starting scheduled cleanup of old files...`);

    let deletedCount = 0;
    let checkedCount = 0;
    const cutoffTime = Date.now() - (MAX_FILE_AGE_HOURS * 60 * 60 * 1000);
    let files: string[] = [];

    try {
        files = await fsPromises.readdir(TEMP_UPLOAD_DIR);
        checkedCount = files.length;
        logger.debug({ ...logContext, fileCount: checkedCount }, "Read directory contents for cleanup.");

    } catch (readDirError: any) {
        if (readDirError.code === 'ENOENT') {
            logger.warn(logContext, `Temporary directory not found during cleanup scan.`);
            return;
        } else {
            logger.error({ ...logContext, err: readDirError }, `Error reading temporary directory during cleanup scan.`);
            return;
        }
    }

    for (const file of files) {
        const filePath = path.join(TEMP_UPLOAD_DIR, file);
        try {
            const stats = await fsPromises.stat(filePath);

            if (stats.isFile() && stats.mtimeMs < cutoffTime) {
                await fsPromises.unlink(filePath);
                logger.debug(
                    { file: filePath, modified: new Date(stats.mtimeMs).toISOString() },
                    `Deleted old temp file`
                );
                deletedCount++;
            }
        } catch (statOrUnlinkError: any) {

            if (statOrUnlinkError.code !== 'ENOENT') {

                logger.error(
                    { err: statOrUnlinkError, file: filePath },
                    `Error processing/deleting temp file during cleanup.`
                );
            }
        }
    }

    logger.info(
        { ...logContext, checked: checkedCount, deleted: deletedCount },
        `Temp file cleanup finished.`
    );
}

/**
 * schedules cleanup task using node-cron
 * @param logger - logger instance
 */
function scheduleTempFileCleanup(logger: FastifyInstance['log']): void {
    const cronPattern = process.env.TEMP_FILE_CLEANUP_CRON || '0 3 * * *';
    if (cron.validate(cronPattern)) {
        logger.info(`Scheduling temp file cleanup with pattern: "${cronPattern}"`);
        cron.schedule(cronPattern, () => {
            cleanupOldTempFiles(logger.child({ task: 'temp-file-cleanup' }));
        }, {
            scheduled: true,
        });
    } else {
        logger.error(`Invalid CRON pattern provided for TEMP_FILE_CLEANUP_CRON: "${cronPattern}". Cleanup task NOT scheduled.`);
    }
}

export async function buildServer(): Promise<FastifyInstance> {
    const TEMP_UPLOAD_DIR = path.resolve(process.env.TEMP_DIR || '/tmp/emporte-uploads');
    const server = fastify({
        logger: {
            level: process.env.LOG_LEVEL || 'info',
            transport: process.env.NODE_ENV !== 'production'
                ? { target: 'pino-pretty' }
                : undefined,
        },
        trustProxy: process.env.TRUST_PROXY === 'true' || false,
    });

    await server.register(redis_plugin);
    await server.register(session_plugin);
    await server.register(cors_plugin);
    await server.register(oauth2_plugin);
    await server.register(multipart_plugin);
    await server.register(rate_limit_plugin);
    await server.register(bullmq_plugin);

    server.log.info('Core setup plugins registered.');

    await setupTemporaryDirectory(TEMP_UPLOAD_DIR, server.log);

    server.setErrorHandler((error: FastifyError | any, request, reply) => {
        const statusCode = error.statusCode || 500;
        const isClientError = statusCode >= 400 && statusCode < 500;

        if (isClientError && statusCode !== 429) {
            request.log.info({ err: { message: error.message, code: error.code }, reqId: request.id }, `Client Error`);
        } else {
            request.log.error({ err: error, reqId: request.id }, `Request Error`);
        }

        if (reply.sent) {
            request.log.warn("Reply already sent, cannot send error response.");
            return;
        }

        if (statusCode === 429) {
            return reply.send(error);
        }

        if (error instanceof ZodError) {
            return reply.status(400).send({
                success: false,
                error: 'Validation Error',
                message: 'Invalid input data provided.',
                details: error.issues.map(issue => ({
                    path: issue.path.join('.'),
                    message: issue.message,
                })),
            });
        }

        if (error.code && error.code.startsWith('FST_MULTIPART')) {
            return reply.status(400).send({
                success: false,
                error: 'File Upload Error',
                message: error.message,
                code: error.code
            });
        }

        reply.status(statusCode).send({
            success: false,
            error: isClientError ? (error.message || 'Bad Request') : 'Internal Server Error',
            message: isClientError ? error.message : 'An unexpected error occurred on the server.',
            stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined,
        });
    });

    server.log.info("registering auth routes...");

    await server.register(auth_routes);

    server.log.info('auth routes registered.');

    server.log.info("registering upload routes...");

    await server.register(upload_routes);

    server.log.info('upload routes registered.');

    server.log.info("registering preview routes...");

    await server.register(preview_routes);

    server.log.info('upload routes registered.');

    server.log.info("registering calendar routes...");

    await server.register(calendar_routes);

    server.log.info('calendar routes registered.');

    server.get('/health', {
        // config: { rateLimit: false } // disable rate limit for health check if needed
    }, async (request, reply) => {
        const redisStatus = await server.redis.ping().then(() => 'ready').catch(() => 'error');
        if (redisStatus === 'error') {
            reply.code(503);
            return { status: 'error', redisConnected: false };
        }
        return { status: 'ok', redisConnected: true, timestamp: new Date().toISOString() };
    });


    const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
    let shuttingDown = false;
    async function closeGracefully(signal: NodeJS.Signals | string) {
        if (shuttingDown) return;
        shuttingDown = true;
        const log = serverInstance ? serverInstance.log : console;
        log.warn(`Received signal: ${signal}. Shutting down gracefully...`);

        try {

            if (serverInstance) {
                await serverInstance.close();
                log.info('Fastify server closed (triggered plugin cleanup).');
            } else {
                log.warn('Server instance not available for graceful close.');
            }


            log.warn('Graceful shutdown sequence complete.');
            process.exit(0);
        } catch (err: any) {
            log.error({ err }, 'Error during graceful shutdown.');
            process.exit(1);
        }
    }

    signals.forEach((signal) => { process.on(signal, () => closeGracefully(signal)); });
    process.on('unhandledRejection', (reason: any, promise) => {
        const log = serverInstance ? serverInstance.log : console;
        log.error({ reason, promise }, 'Unhandled Rejection! Shutting down...');
        closeGracefully('unhandledRejection');
    });
    process.on('uncaughtException', (err: Error, origin) => {
        const log = serverInstance ? serverInstance.log : console;
        log.error({ err, origin }, `Uncaught Exception! Shutting down...`);
        closeGracefully('uncaughtException');
    });


    let serverInstance: FastifyInstance | null = null;

    return server;
}


async function run() {
    let serverInstance: FastifyInstance | null = null;
    try {
        serverInstance = await buildServer();
        scheduleTempFileCleanup(serverInstance.log);
        const PORT = parseInt(process.env.PORT || '3001', 10);
        const HOST = process.env.HOST || '0.0.0.0';
        await serverInstance.listen({ port: PORT, host: HOST });
    } catch (err: any) {
        console.error("!!! CRITICAL ERROR DURING SERVER STARTUP !!!", err);
        if (serverInstance?.log) serverInstance.log.fatal({ err }, "Server startup failed");
        process.exit(1);
    }
}

run();