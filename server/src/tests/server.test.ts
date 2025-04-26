import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { FastifyInstance, FastifyError } from 'fastify';
import request from 'supertest';
import { ZodError, z } from 'zod';

import { buildTestServer, cleanupTestDatabase } from './helpers/server.helper';

describe('Core Server Functionality', () => {
    let app: FastifyInstance;
    let redisPingSpy: vi.SpyInstance;

    beforeAll(async () => {
        const addErrorHandlerTestRoutes = (appInstance: FastifyInstance) => {
            appInstance.get('/test/error/generic', async (request, reply) => {
                throw new Error('Generic test error');
            });
            appInstance.get('/test/error/statuscode', async (request, reply) => {
                const err = new Error('Permission Denied') as FastifyError;
                err.statusCode = 403;
                throw err;
            });
            appInstance.get('/test/error/zod', async (request, reply) => {
                try {
                    z.object({ name: z.string().min(3) }).parse({ name: 'a' });
                } catch (error) { throw error; }
            });
            appInstance.get('/test/error/multipart', async (request, reply) => {
                const err = new Error('Test multipart file issue') as FastifyError;
                err.code = 'FST_MULTIPART_SOMETHING_WRONG';
                err.statusCode = 400;
                throw err;
            });
        };

        app = await buildTestServer(addErrorHandlerTestRoutes);

        if (app.redis) {
            redisPingSpy = vi.spyOn(app.redis, 'ping');
        } else { throw new Error("app.redis decorator not found."); }
    });

    afterAll(async () => {
        await app.close();
    });

    beforeEach(async () => {
        redisPingSpy.mockReset();
        await cleanupTestDatabase();
    });

    describe('GET /health', () => {
        it('should return 200 OK with status "ok" when Redis pings successfully', async () => {
            redisPingSpy.mockResolvedValue('PONG');

            const response = await request(app.server).get('/health');

            expect(response.status).toBe(200);
            expect(response.body.status).toBe('ok');
            expect(response.body.redisConnected).toBe(true);
            expect(response.body.timestamp).toEqual(expect.any(String));
            expect(redisPingSpy).toHaveBeenCalledTimes(1);
        });

        it('should return 503 Service Unavailable with status "error" when Redis ping fails', async () => {
            const redisError = new Error('Connection refused');
            redisPingSpy.mockRejectedValue(redisError);

            const response = await request(app.server).get('/health');

            expect(response.status).toBe(503);
            expect(response.body).toEqual({
                status: 'error',
                redisConnected: false
            });
            expect(redisPingSpy).toHaveBeenCalledTimes(1);
        });
    });

    describe('Global Error Handler (setErrorHandler)', () => {
        it('should return 500 and generic message for a generic Error', async () => {
            const response = await request(app.server).get('/test/error/generic');

            expect(response.status).toBe(500);
            expect(response.body.success).toBe(false);
            expect(response.body.error).toBe('Internal Server Error');
            expect(response.body.message).toBe('An unexpected error occurred on the server.');
            if (process.env.NODE_ENV !== 'production') {
                expect(response.body.stack).toBeDefined();
            } else {
                expect(response.body.stack).toBeUndefined();
            }
        });

        it('should return the specific status code and message for an error with statusCode', async () => {
            const response = await request(app.server).get('/test/error/statuscode');

            expect(response.status).toBe(403);
            expect(response.body.success).toBe(false);
            expect(response.body.error).toBe('Permission Denied');
            expect(response.body.message).toBe('Permission Denied');
            if (process.env.NODE_ENV !== 'production') {
                expect(response.body.stack).toEqual(expect.any(String));
                expect(response.body.stack).toContain('Permission Denied');
            } else {
                expect(response.body.stack).toBeUndefined();
            }
        });

        it('should return 400 and formatted details for a ZodError', async () => {
            const response = await request(app.server).get('/test/error/zod');

            expect(response.status).toBe(400);
            expect(response.body.success).toBe(false);
            expect(response.body.error).toBe('Validation Error');
            expect(response.body.message).toBe('Invalid input data provided.');
            expect(response.body.details).toBeInstanceOf(Array);
            expect(response.body.details).toHaveLength(1);
            expect(response.body.details[0]).toEqual({
                path: 'name',
                message: expect.stringContaining('String must contain at least 3 character(s)')
            });
            expect(response.body.stack).toBeUndefined();
        });

        it('should return 400 and specific format for a Fastify Multipart Error', async () => {
            const response = await request(app.server).get('/test/error/multipart');

            expect(response.status).toBe(400);
            expect(response.body).toEqual({
                success: false,
                error: 'File Upload Error',
                message: 'Test multipart file issue',
                code: 'FST_MULTIPART_SOMETHING_WRONG'
            });
            expect(response.body.stack).toBeUndefined();
        });

    });

});