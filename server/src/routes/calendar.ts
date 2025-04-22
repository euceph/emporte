import { FastifyInstance, FastifyPluginOptions, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { ZodError, z } from 'zod';
import IORedis from 'ioredis';
import { calendar_v3 } from "googleapis";


import {
    createCalendarBodySchema,
    scheduleDataSchema,
    type CreateCalendarBody,
    type ScheduleData
} from '@emporte/common';


import {
    formatEventsForGoogle,
    createCalendarEvents
} from '../services/calendar.service';

async function calendar_routes(fastify: FastifyInstance, options: FastifyPluginOptions) {

    if (!fastify.redis) {
        throw new Error("Redis client decorator ('redis') is not available. Ensure Redis plugin is registered before calendar routes.");
    }
    const redisClient = fastify.redis as IORedis;


    fastify.post('/api/calendar/create', {
        config: {
            rateLimit: {
                max: parseInt(process.env.CALENDAR_CREATE_RATE_LIMIT_MAX || '5', 10),
                timeWindow: process.env.CALENDAR_CREATE_RATE_LIMIT_WINDOW || '10 minutes',
            }
        },
    }, async (request: FastifyRequest<{ Body: unknown }>, reply: FastifyReply) => {
        const log = request.log.child({ handler: '/api/calendar/create' });
        log.info('--- Entered /api/calendar/create handler ---');


        if (!request.session?.sessionId || !request.session?.googleTokens?.accessToken || Date.now() >= request.session.googleTokens.expiresAt) {
            log.warn('Calendar create blocked: Invalid session or token expired.');
            await request.session?.destroy(); reply.clearCookie('sessionId', { path: '/' });
            return reply.code(401).send({ success: false, error: 'Unauthorized', message: 'Invalid session or token expired. Please log in again.' });
        }
        const accessToken = request.session.googleTokens.accessToken;
        const sessionId = request.session.sessionId;
        log.info('Auth check passed for calendar creation.');


        let validatedBody: z.infer<typeof createCalendarBodySchema>;
        try {

            validatedBody = createCalendarBodySchema.parse(request.body);
            log.info("Request body passed Zod validation.");
        } catch (error) {

            if (error instanceof ZodError) {
                log.error({ errors: error.issues }, "Validation failed for /api/calendar/create request body.");


                return reply.status(400).send({
                    success: false,
                    error: 'Validation Error',
                    message: 'Invalid request body provided.',
                    details: error.issues.map(issue => ({
                        path: issue.path.join('.'),
                        message: issue.message,
                    })),
                });
            }

            log.error({ err: error }, "Unexpected error during request body validation.");
            throw error;
        }



        const userTimeZone = validatedBody.userTimeZone;

        const validatedScheduleData: z.infer<typeof scheduleDataSchema> = {
            termStartDate: validatedBody.termStartDate,
            termEndDate: validatedBody.termEndDate,
            scheduleEvents: validatedBody.scheduleEvents,
        };


        let googleEvents: calendar_v3.Schema$Event[] = [];
        let creationResult: { successCount: number; errors: any[] } = { successCount: 0, errors: [] };
        const redisKey = `preview:${sessionId}`;


        try {

            googleEvents = formatEventsForGoogle(validatedScheduleData, userTimeZone, log);
            if (googleEvents.length === 0) log.warn("No valid events formatted.");
        } catch (formatError: any) {
            log.error({ err: formatError }, "Failed to format events for Google Calendar.");

            if (formatError.message.includes("Invalid user timezone")) {
                return reply.code(400).send({ success: false, error: 'Bad Request', message: formatError.message });
            }
            return reply.code(500).send({ success: false, error: 'Processing Error', message: `Failed to process schedule: ${formatError.message}` });
        }


        if (googleEvents.length > 0) {
            try {
                creationResult = await createCalendarEvents(accessToken, googleEvents, log);
                log.info({ success: creationResult.successCount, failures: creationResult.errors.length }, "Google Calendar creation attempt finished.");
            } catch (calendarError: any) {
                log.error({ err: calendarError }, "Unhandled error during Google Calendar creation.");
                creationResult.errors.push({ eventSummary: 'Overall Process Failure', error: calendarError.message || 'Unknown calendar API error' });
            }
        } else { log.info("Skipping Google Calendar API call as no events were formatted."); }



        log.info({ key: redisKey }, "Initiating cleanup of Redis preview data.");
        redisClient.del(redisKey)
            .then((count: number) => log.info({ key: redisKey, count }, 'Redis preview key deletion command issued.'))
            .catch((err: any) => log.error({ err, key: redisKey }, 'Failed to issue Redis key deletion command.'));



        if (creationResult.errors.length === 0 && googleEvents.length > 0) {
            return reply.send({ success: true, message: `Successfully created ${creationResult.successCount} event series.`, details: { created: creationResult.successCount } });
        } else if (creationResult.errors.length > 0) {
            const message = `Created ${creationResult.successCount} event series, but failed for ${creationResult.errors.length}.`;
            log.warn({ results: creationResult }, "Calendar creation finished with errors.");

            return reply.code(200).send({ success: false, message: message, details: creationResult });
        } else if (googleEvents.length === 0 && creationResult.successCount === 0) {

            return reply.send({ success: true, message: "Schedule processed, but no valid events found to add to the calendar.", details: { created: 0 } });
        } else {

            log.error("Reached unexpected state in final response logic.");
            return reply.code(500).send({ success: false, error: "Internal Server Error", message: "An unexpected error occurred processing the final response."});
        }
    });

}

export default fp(calendar_routes);