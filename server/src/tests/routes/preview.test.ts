import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { FastifyInstance } from 'fastify';
import request from 'supertest';
import IORedis from 'ioredis';

import { buildTestServer, cleanupTestDatabase } from '../helpers/server.helper';
import { previewResultSchema, type PreviewResult } from '@emporte/common';
import { ScheduleData, ScheduleEvent } from '@emporte/common';

const validScheduleEvent: ScheduleEvent = {
    courseCode: "CS101",
    courseName: "Intro to CS",
    sectionDetails: "Section A",
    days: ["Mon", "Wed"],
    startTime: "10:00 AM",
    endTime: "11:00 AM",
    location: "Room 101"
};

const validScheduleData: ScheduleData = {
    termStartDate: "2024-09-01",
    termEndDate: "2024-12-15",
    scheduleEvents: [validScheduleEvent]
};

const validPreviewResult: PreviewResult = {
    scheduleData: validScheduleData,
    processingWarnings: [{ message: "Optional warning" }],
    processingErrors: []
};

const TEST_REDIS_URL = process.env.TEST_REDIS_URL || 'redis://localhost:6379/1';
let redisClientForTestChecks: IORedis;


describe('Preview Routes', () => {
    let app: FastifyInstance;
    let redisGetSpy: vi.SpyInstance;
    let redisDelSpy: vi.SpyInstance;

    beforeAll(async () => {
        app = await buildTestServer();
        redisClientForTestChecks = new IORedis(TEST_REDIS_URL);

        if (app.redis) {
            redisGetSpy = vi.spyOn(app.redis, 'get');
            redisDelSpy = vi.spyOn(app.redis, 'del');
        } else { throw new Error("app.redis decorator not found."); }
    });

    afterAll(async () => {
        await redisClientForTestChecks.quit();
        await app.close();
    });

    beforeEach(async () => {
        redisGetSpy.mockReset();
        redisDelSpy.mockReset();
        await cleanupTestDatabase();
    });

    async function getAuthCookie(): Promise<{ cookie: string, sessionId: string }> {
        const loginResponse = await request(app.server).post('/test/login').send({ accessToken: 'preview-test-token', expiresAt: Date.now() + 3600000 });
        if (loginResponse.status !== 200) { throw new Error(`Test login failed`); }
        const cookiesHeader = loginResponse.headers['set-cookie'];
        let sessionCookie: string | undefined;
        if (Array.isArray(cookiesHeader)) { sessionCookie = cookiesHeader.find((c: string) => c.startsWith('sessionId=')); }
        else if (typeof cookiesHeader === 'string' && cookiesHeader.startsWith('sessionId=')) { sessionCookie = cookiesHeader; }
        if (!sessionCookie) { throw new Error("Session cookie not found"); }
        const cookieValue = sessionCookie.substring('sessionId='.length);
        const idPart = cookieValue?.split('.')[0]?.split(';')[0];
        if (!idPart) { throw new Error("Could not extract session ID"); }
        return { cookie: sessionCookie, sessionId: idPart };
    }

    describe('GET /api/preview', () => {

        it('should return 401 Unauthorized if user is not logged in', async () => {
            const response = await request(app.server).get('/api/preview');
            expect(response.status).toBe(401);
            expect(redisGetSpy).not.toHaveBeenCalled();
        });

        it('should return 404 Not Found if preview data does not exist in Redis', async () => {
            const { cookie, sessionId } = await getAuthCookie();
            await new Promise(resolve => setTimeout(resolve, 50));

            const response = await request(app.server)
                .get('/api/preview')
                .set('Cookie', cookie);

            expect(response.status).toBe(404);
            expect(response.body).toEqual({
                success: false, error: 'Not Found', message: expect.stringMatching(/Preview data not found or expired/i)
            });
            expect(redisGetSpy).toHaveBeenCalledWith(`preview:${sessionId}`);
        });

        it('should return 500 Internal Server Error if Redis GET command fails for preview key', async () => {
            const { cookie, sessionId } = await getAuthCookie();
            const redisError = new Error("Redis connection timeout");
            const previewKey = `preview:${sessionId}`;
            const sessionKey = `session:${sessionId}`;

            redisGetSpy.mockImplementation(async (key: string) => {
                if (key === previewKey) {
                    console.log(`DEBUG: Mock throwing error for preview key: ${key}`);
                    throw redisError;
                }
                if (key === sessionKey) {
                    console.log(`DEBUG: Mock returning dummy session data for key: ${key}`);
                    return JSON.stringify({
                        cookie: { expires: new Date(Date.now() + 86400000).toISOString(), originalMaxAge: 86400000 },
                        googleTokens: { accessToken: 'dummy-token-for-redis-fail-test', expiresAt: Date.now() + 60000 }
                    });
                }
                console.log(`DEBUG: Mock returning undefined for unexpected key: ${key}`);
                return undefined;
            });

            const response = await request(app.server)
                .get('/api/preview')
                .set('Cookie', cookie);

            expect(response.status).toBe(500);
            expect(response.body).toEqual(expect.objectContaining({
                success: false, error: 'Internal Server Error', message: 'An unexpected error occurred on the server.'
            }));
            expect(redisGetSpy).toHaveBeenCalledWith(previewKey);
        });

        it('should return 500 Internal Server Error and delete key if stored data is malformed JSON', async () => {
            const { cookie, sessionId } = await getAuthCookie();
            const malformedJson = '{"scheduleData": { "termStartDate": "oops", events: []}';
            const redisKey = `preview:${sessionId}`;

            await redisClientForTestChecks.set(redisKey, malformedJson);
            redisDelSpy.mockResolvedValue(1);
            await new Promise(resolve => setTimeout(resolve, 50));

            const response = await request(app.server)
                .get('/api/preview')
                .set('Cookie', cookie);

            expect(response.status).toBe(500);
            expect(response.body).toEqual({
                success: false,
                error: 'Internal Server Error',
                message: 'Failed to read preview data.',
            });
            expect(redisGetSpy).toHaveBeenCalledWith(redisKey);
            expect(redisDelSpy).toHaveBeenCalledTimes(1);
            expect(redisDelSpy).toHaveBeenCalledWith(redisKey);
        });

        it('should return 500 Internal Server Error and delete key if stored data fails schema validation', async () => {
            const { cookie, sessionId } = await getAuthCookie();
            const invalidData = { scheduleData: { scheduleEvents: [{ courseCode: 123 }] } };
            const redisKey = `preview:${sessionId}`;

            await redisClientForTestChecks.set(redisKey, JSON.stringify(invalidData));
            redisDelSpy.mockResolvedValue(1);
            await new Promise(resolve => setTimeout(resolve, 50));

            const response = await request(app.server)
                .get('/api/preview')
                .set('Cookie', cookie);

            expect(response.status).toBe(500);
            expect(response.body).toEqual({
                success: false, error: 'Internal Server Error', message: 'Failed to read preview data.'
            });
            expect(redisGetSpy).toHaveBeenCalledWith(redisKey);
            expect(redisDelSpy).toHaveBeenCalledWith(redisKey);
        });

        it('should return 200 OK with valid preview data if found and valid', async () => {
            const { cookie, sessionId } = await getAuthCookie();
            const redisKey = `preview:${sessionId}`;

            await redisClientForTestChecks.set(redisKey, JSON.stringify(validPreviewResult));
            await new Promise(resolve => setTimeout(resolve, 50));

            const response = await request(app.server)
                .get('/api/preview')
                .set('Cookie', cookie);

            expect(response.status).toBe(200);
            expect(response.body).toEqual({
                success: true, previewResult: validPreviewResult
            });
            expect(redisGetSpy).toHaveBeenCalledWith(redisKey);
            expect(redisDelSpy).not.toHaveBeenCalled();
        });

    });

    describe('DELETE /api/preview/delete', () => {

        it('should return 401 Unauthorized if user is not logged in', async () => {
            const response = await request(app.server).delete('/api/preview/delete');
            expect(response.status).toBe(401);
            expect(response.body?.message).toMatch(/Invalid session/i);
            expect(redisDelSpy).toHaveBeenCalledTimes(1);
            expect(redisDelSpy).toHaveBeenCalledWith(
                expect.arrayContaining([
                    expect.stringMatching(/^session:/)
                ])
            );
        });

        it('should return 204 No Content and delete Redis key if user is logged in and key exists', async () => {
            const { cookie, sessionId } = await getAuthCookie();
            const redisKey = `preview:${sessionId}`;
            await redisClientForTestChecks.set(redisKey, JSON.stringify(validPreviewResult));
            expect(await redisClientForTestChecks.exists(redisKey)).toBe(1);

            const response = await request(app.server)
                .delete('/api/preview/delete')
                .set('Cookie', cookie);

            expect(response.status).toBe(204);
            expect(response.body).toEqual({});
            expect(redisDelSpy).toHaveBeenCalledTimes(1);
            expect(redisDelSpy).toHaveBeenCalledWith(redisKey);
            expect(await redisClientForTestChecks.exists(redisKey)).toBe(0);
        });

        it('should return 204 No Content even if Redis key does not exist', async () => {
            const { cookie, sessionId } = await getAuthCookie();
            const redisKey = `preview:${sessionId}`;
            expect(await redisClientForTestChecks.exists(redisKey)).toBe(0);
            redisDelSpy.mockResolvedValue(0);

            const response = await request(app.server)
                .delete('/api/preview/delete')
                .set('Cookie', cookie);

            expect(response.status).toBe(204);
            expect(response.body).toEqual({});
            expect(redisDelSpy).toHaveBeenCalledTimes(1);
            expect(redisDelSpy).toHaveBeenCalledWith(redisKey);
        });

        it('should return 204 No Content even if Redis delete command fails (but log error)', async () => {
            const { cookie, sessionId } = await getAuthCookie();
            const redisKey = `preview:${sessionId}`;
            const redisError = new Error("Redis DEL connection error");
            redisDelSpy.mockRejectedValue(redisError);

            const response = await request(app.server)
                .delete('/api/preview/delete')
                .set('Cookie', cookie);

            expect(response.status).toBe(204);
            expect(response.body).toEqual({});
            expect(redisDelSpy).toHaveBeenCalledTimes(1);
            expect(redisDelSpy).toHaveBeenCalledWith(redisKey);
        });

    });

});