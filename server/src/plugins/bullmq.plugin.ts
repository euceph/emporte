import { FastifyInstance, FastifyPluginOptions, FastifyBaseLogger } from 'fastify';
import fp from 'fastify-plugin';
import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { processAiJob, AiJobData } from '../services/worker.service';

const AI_PROCESSING_QUEUE_NAME = 'ai-processing';

function initializeBullMQ(queueName: string, redisClient: IORedis, logger: FastifyBaseLogger): { queue: Queue<AiJobData>, worker: Worker } {
    logger.info(`Initializing BullMQ queue '${queueName}'...`);
    if (!redisClient) {
        throw new Error("Redis client instance is required to initialize BullMQ.");
    }

    const queue = new Queue<AiJobData>(queueName, {
        connection: redisClient,
        defaultJobOptions: {
            attempts: parseInt(process.env.JOB_DEFAULT_ATTEMPTS || '3', 10),
            backoff: {
                type: 'exponential',
                delay: parseInt(process.env.JOB_BACKOFF_DELAY_MS || '5000', 10)
            },
            removeOnComplete: { count: 1000 },
            removeOnFail: { count: 5000 },
        },
    });

    queue.on('error', (err: Error) => {
        logger.error({ err, queueName }, `BullMQ Queue Error`);
    });
    logger.info(`BullMQ queue '${queueName}' initialized.`);


    logger.info(`Setting up BullMQ Worker for queue: ${queueName}...`);
    const worker = new Worker<AiJobData>(
        queueName,
        async (job: Job<AiJobData>) => processAiJob(job, redisClient, logger.child({ workerJobId: job.id })),
        {
            connection: redisClient,
            concurrency: parseInt(process.env.WORKER_CONCURRENCY || '3', 10),

        }
    );

    worker.on('completed', (job: Job, result: any) => logger.info({ jobId: job.id, result }, `Worker: Job completed.`));
    worker.on('failed', (job: Job | undefined, err: Error) => logger.error({ jobId: job?.id, err }, `Worker: Job failed.`));
    worker.on('error', (err: Error) => logger.error({ err }, `Worker: Error.`));
    worker.on('active', (job: Job) => logger.info({ jobId: job.id }, `Worker: Job active.`));
    worker.on('stalled', (jobId: string) => logger.warn({ jobId }, `Worker: Job stalled.`));

    logger.info(`BullMQ Worker started for queue '${queueName}'.`);

    return { queue, worker };
}


async function bullmq_plugin(fastify: FastifyInstance, options: FastifyPluginOptions) {
    const logger = fastify.log.child({ plugin: 'BullMQ' });
    logger.info('Setting up BullMQ...');


    if (!fastify.redis) {
        throw new Error("Redis plugin must be registered before the BullMQ plugin.");
    }
    const redisClient = fastify.redis;


    const { queue, worker } = initializeBullMQ(AI_PROCESSING_QUEUE_NAME, redisClient, logger);


    fastify.decorate('aiProcessingQueue', queue);
    logger.info(`BullMQ queue '${AI_PROCESSING_QUEUE_NAME}' decorated onto Fastify instance.`);


    fastify.addHook('onClose', async (instance) => {
        instance.log.info('Closing BullMQ worker...');
        await worker.close();
        instance.log.info('BullMQ worker closed.');
    });
}

export default fp(bullmq_plugin, {
    name: 'emporte-bullmq',
    dependencies: ['emporte-redis']
});