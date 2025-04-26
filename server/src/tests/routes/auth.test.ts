import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { FastifyInstance } from 'fastify';
import request from 'supertest';
import IORedis from 'ioredis';
import { buildTestServer, cleanupTestDatabase } from '../helpers/server.helper';

vi.stubGlobal('fetch', vi.fn());

const mockedFetch = fetch as vi.Mock;

const TEST_REDIS_URL = process.env.TEST_REDIS_URL || 'redis://localhost:6379/1';
let redisClientForTestChecks: IORedis;

describe('Auth Routes', () => {
    let app: FastifyInstance;

    let oauthSpy: vi.SpyInstance;

    beforeAll(async () => {
        app = await buildTestServer();
        redisClientForTestChecks = new IORedis(TEST_REDIS_URL);

        if (app.googleOAuth2) {
            oauthSpy = vi.spyOn(app.googleOAuth2, 'getAccessTokenFromAuthorizationCodeFlow');
        } else {
            throw new Error("app.googleOAuth2 decorator not found. Check plugin registration order/logic.");
        }
    });

    afterAll(async () => {
        await redisClientForTestChecks.quit();
        await app.close();
    });

    beforeEach(async () => {
        mockedFetch.mockReset();
        oauthSpy.mockReset();
        await cleanupTestDatabase();
    });

    describe('/api/me', () => {

        it('GET /api/me should return 401 Unauthorized if no session cookie is provided', async () => {
            const response = await request(app.server).get('/api/me');

            expect(response.status).toBe(401);
            expect(response.body).toEqual({
                error: 'Unauthorized',
                message: 'No active session found.',
            });
            expect(mockedFetch).not.toHaveBeenCalled();
        });

        it('GET /api/me should return user info if authenticated with a valid session', async () => {
            const testAccessToken = 'valid-test-access-token-123';
            const testExpiresAt = Date.now() + 3600 * 1000;
            const mockUserInfo = { sub: '12345', name: 'Test User', email: 'test@example.com', picture: '' };

            mockedFetch.mockResolvedValueOnce(
                new Response(JSON.stringify(mockUserInfo), { status: 200, headers: { 'Content-Type': 'application/json' } })
            );

            const loginResponse = await request(app.server)
                .post('/test/login')
                .send({ accessToken: testAccessToken, expiresAt: testExpiresAt });

            const cookiesHeader = loginResponse.headers['set-cookie'];
            expect(cookiesHeader).toBeDefined();

            let sessionCookie: string | undefined;

            if (Array.isArray(cookiesHeader)) {
                sessionCookie = cookiesHeader.find((cookie: string) => cookie.startsWith('sessionId='));
            } else if (typeof cookiesHeader === 'string') {
                if (cookiesHeader.startsWith('sessionId=')) {
                    sessionCookie = cookiesHeader;
                }
            }

            expect(sessionCookie).toBeDefined();

            const response = await request(app.server)
                .get('/api/me')
                .set('Cookie', sessionCookie as string);

            expect(response.status).toBe(200);
            expect(response.body).toEqual({
                authenticated: true,
                user: mockUserInfo,
            });

            expect(mockedFetch).toHaveBeenCalledTimes(1);
            expect(mockedFetch).toHaveBeenCalledWith(
                'https://www.googleapis.com/oauth2/v3/userinfo',
                expect.objectContaining({
                    headers: expect.objectContaining({ Authorization: `Bearer ${testAccessToken}` }),
                })
            );
        });

        it('GET /api/me should return 401 Unauthorized if session token is expired', async () => {
            const testAccessToken = 'expired-test-access-token-456';
            const testExpiresAt = Date.now() - 5000;

            const loginResponse = await request(app.server)
                .post('/test/login')
                .send({ accessToken: testAccessToken, expiresAt: testExpiresAt });
            expect(loginResponse.status).toBe(200);

            const cookiesHeader = loginResponse.headers['set-cookie'];
            expect(cookiesHeader).toBeDefined();
            let sessionCookie: string | undefined;
            if (Array.isArray(cookiesHeader)) {
                sessionCookie = cookiesHeader.find((cookie: string) => cookie.startsWith('sessionId='));
            } else if (typeof cookiesHeader === 'string' && cookiesHeader.startsWith('sessionId=')) {
                sessionCookie = cookiesHeader;
            }
            expect(sessionCookie).toBeDefined();

            const response = await request(app.server)
                .get('/api/me')
                .set('Cookie', sessionCookie as string);

            expect(response.status).toBe(401);
            expect(response.body).toEqual({
                error: 'Unauthorized',
                message: 'Session expired. Please log in again.',
            });
            expect(mockedFetch).not.toHaveBeenCalled();
        });


        it('GET /api/me should return 401 Unauthorized if Google API rejects the token', async () => {
            const testAccessToken = 'valid-but-rejected-token-789';
            const testExpiresAt = Date.now() + 3600 * 1000;

            mockedFetch.mockResolvedValueOnce(
                new Response(null, {
                    status: 401,
                    statusText: 'Unauthorized'
                })
            );

            const loginResponse = await request(app.server)
                .post('/test/login')
                .send({ accessToken: testAccessToken, expiresAt: testExpiresAt });
            expect(loginResponse.status).toBe(200);

            const cookiesHeader = loginResponse.headers['set-cookie'];
            expect(cookiesHeader).toBeDefined();
            let sessionCookie: string | undefined;
            if (Array.isArray(cookiesHeader)) {
                sessionCookie = cookiesHeader.find((cookie: string) => cookie.startsWith('sessionId='));
            } else if (typeof cookiesHeader === 'string' && cookiesHeader.startsWith('sessionId=')) {
                sessionCookie = cookiesHeader;
            }
            expect(sessionCookie).toBeDefined();

            const response = await request(app.server)
                .get('/api/me')
                .set('Cookie', sessionCookie as string);

            expect(response.status).toBe(401);
            expect(response.body).toEqual({
                error: 'Unauthorized',
                message: 'Google token rejected. Please log in again.',
            });
            expect(mockedFetch).toHaveBeenCalledTimes(1);
            expect(mockedFetch).toHaveBeenCalledWith(
                'https://www.googleapis.com/oauth2/v3/userinfo',
                expect.objectContaining({
                    headers: expect.objectContaining({ Authorization: `Bearer ${testAccessToken}` }),
                })
            );
        });

    });


    describe('/auth/logout', () => {
        it('should redirect and destroy session if user is logged in', async () => {
            const testAccessToken = 'token-for-logout';
            const testExpiresAt = Date.now() + 3600000;

            const loginResponse = await request(app.server)
                .post('/test/login')
                .send({ accessToken: testAccessToken, expiresAt: testExpiresAt });
            expect(loginResponse.status).toBe(200);

            const cookiesHeader = loginResponse.headers['set-cookie'];
            expect(cookiesHeader).toBeDefined();
            let sessionCookie: string | undefined;
            let sessionId: string | undefined;
            const sessionCookiePrefix = 'sessionId=';
            if (Array.isArray(cookiesHeader)) {
                sessionCookie = cookiesHeader.find((cookie: string) => cookie.startsWith(sessionCookiePrefix));
            } else if (typeof cookiesHeader === 'string' && cookiesHeader.startsWith(sessionCookiePrefix)) {
                sessionCookie = cookiesHeader;
            }
            expect(sessionCookie).toBeDefined();
            const cookieValue = sessionCookie?.substring(sessionCookiePrefix.length);
            const idPart = cookieValue?.split('.')[0];
            sessionId = idPart?.split(';')[0];
            expect(sessionId).toBeDefined();

            console.log(`DEBUG: Using pure Session ID for Redis check: ${sessionId}`);
            console.log(`DEBUG: Checking Redis for key: session:${sessionId}`);

            const sessionExistsBefore = await redisClientForTestChecks.exists(`session:${sessionId}`);
            console.log(`DEBUG: sessionExistsBefore result: ${sessionExistsBefore}`);
            expect(sessionExistsBefore).toBe(1);

            const response = await request(app.server)
                .get('/auth/logout')
                .set('Cookie', sessionCookie as string)
                .redirects(0);

            expect(response.status).toBe(302);
            expect(response.headers.location).toBe(process.env.CLIENT_BASE_URL || '/');

            const logoutCookieHeader = response.headers['set-cookie'];
            expect(logoutCookieHeader).toBeDefined();
            expect(logoutCookieHeader?.[0]).toMatch(/^sessionId=;/);
            expect(logoutCookieHeader?.[0]).toContain('Expires=Thu, 01 Jan 1970 00:00:00 GMT');

            const sessionExistsAfter = await redisClientForTestChecks.exists(`session:${sessionId}`);
            console.log(`DEBUG: sessionExistsAfter result: ${sessionExistsAfter}`);
            expect(sessionExistsAfter).toBe(0);
        });

        it('should return success message if user is not logged in', async () => {

            const response = await request(app.server)
                .get('/auth/logout');

            expect(response.status).toBe(200);
            expect(response.body).toEqual({
                message: 'No active session to log out from.',
            });
        });

        it.todo('should return 500 if session destruction fails');

    });

    describe('/auth/google/callback', () => {

        it('should save tokens to session and redirect on successful auth code exchange', async () => {
            const mockOAuthTokens = {
                token: {
                    access_token: 'mock-access-token-123',
                    refresh_token: 'mock-refresh-token-456',
                    expires_in: 3599
                }
            };
            const expectedRedirectUrl = process.env.CLIENT_BASE_URL + '/import';

            oauthSpy.mockResolvedValueOnce(mockOAuthTokens);

            const startTime = Date.now();

            const response = await request(app.server)
                .get('/auth/google/callback?code=testcode&state=teststate')
                .redirects(0);

            expect(response.status).toBe(302);
            expect(response.headers.location).toBe(expectedRedirectUrl);

            expect(oauthSpy).toHaveBeenCalledTimes(1);

            const cookiesHeader = response.headers['set-cookie'];
            expect(cookiesHeader).toBeDefined();
            let sessionCookie: string | undefined;
            let sessionId: string | undefined;
            const sessionCookiePrefix = 'sessionId=';
            if (Array.isArray(cookiesHeader)) {
                sessionCookie = cookiesHeader.find((cookie: string) => cookie.startsWith(sessionCookiePrefix));
            } else if (typeof cookiesHeader === 'string' && cookiesHeader.startsWith(sessionCookiePrefix)) {
                sessionCookie = cookiesHeader;
            }
            expect(sessionCookie).toBeDefined();
            const idPart = sessionCookie?.substring(sessionCookiePrefix.length).split('.')[0].split(';')[0];
            expect(idPart).toBeDefined();
            sessionId = idPart;

            const sessionKey = `session:${sessionId}`;
            const sessionDataString = await redisClientForTestChecks.get(sessionKey);
            expect(sessionDataString).toBeDefined();

            const sessionData = JSON.parse(sessionDataString as string);
            expect(sessionData.googleTokens).toBeDefined();
            expect(sessionData.googleTokens.accessToken).toBe(mockOAuthTokens.token.access_token);
            expect(sessionData.googleTokens.refreshToken).toBe(mockOAuthTokens.token.refresh_token);

            const expectedExpiresAt = startTime + (mockOAuthTokens.token.expires_in * 1000);
            expect(sessionData.googleTokens.expiresAt).toBeGreaterThanOrEqual(startTime);
            expect(sessionData.googleTokens.expiresAt).toBeLessThanOrEqual(expectedExpiresAt + 5000);
            expect(sessionData.googleTokens.expiresAt).toBeGreaterThanOrEqual(expectedExpiresAt - 5000);

        });

        it('should return 500 error if auth code exchange fails', async () => {
            const mockError = new Error('Google OAuth Error: Invalid grant');
            oauthSpy.mockRejectedValueOnce(mockError);

            const response = await request(app.server)
                .get('/auth/google/callback?code=invalidcode&state=teststate');

            expect(response.status).toBe(500);
            expect(response.body).toEqual({
                error: 'Authentication failed',
                message: mockError.message,
            });

            expect(oauthSpy).toHaveBeenCalledTimes(1);

            expect(response.headers['set-cookie']).toBeUndefined();
        });

    });

});