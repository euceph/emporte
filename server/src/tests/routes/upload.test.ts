import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { FastifyInstance } from 'fastify';
import request from 'supertest';
import path from 'path';
import fs from 'fs/promises';
import { buildTestServer, cleanupTestDatabase } from '../helpers/server.helper';

const TEST_TEMP_DIR = path.resolve(process.env.TEMP_DIR || '/tmp/emporte-uploads-test');
const DUMMY_FILE_1 = path.join(TEST_TEMP_DIR, 'test-schedule-1.pdf');
const DUMMY_FILE_2 = path.join(TEST_TEMP_DIR, 'test-schedule-2.png');
const DUMMY_FILE_LARGE = path.join(TEST_TEMP_DIR, 'test-schedule-large.jpeg');

const MAX_FILES = parseInt(process.env.MAX_FILE_COUNT || '4', 10);
const MAX_SIZE_BYTES = parseInt(process.env.MAX_FILE_SIZE_BYTES || (10 * 1024 * 1024).toString(), 10);

async function createDummyFile(filePath: string, size: number = 10): Promise<void> {
    try {
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        const buffer = Buffer.alloc(size, 'a');
        await fs.writeFile(filePath, buffer);
    } catch (err) {
        console.error(`DEBUG: Error creating dummy file ${filePath}`, err);
        throw err;
    }
}

async function cleanupDummyFiles(dirPath: string): Promise<void> {
    try {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        const unlinkPromises = entries.map((entry) => {
            const fullPath = path.join(dirPath, entry.name);
            return entry.isFile() ? fs.unlink(fullPath) : Promise.resolve();
        });
        await Promise.all(unlinkPromises);
        console.log(`DEBUG: Cleaned contents of test temp dir: ${dirPath}`);
    } catch (err: any) {
        if (err.code === 'ENOENT') {
            console.log(`DEBUG: Test temp dir not found during cleanup: ${dirPath}`);
        } else {
            console.error(`DEBUG: Error cleaning test temp dir ${dirPath}`, err);
        }
    }
}


describe('Upload Routes', () => {
    let app: FastifyInstance;
    let queueSpy: vi.SpyInstance;

    const filesToCleanup: string[] = [DUMMY_FILE_1, DUMMY_FILE_2, DUMMY_FILE_LARGE];

    beforeAll(async () => {
        await fs.mkdir(TEST_TEMP_DIR, { recursive: true });
        app = await buildTestServer();

        if (app.aiProcessingQueue) {
            queueSpy = vi.spyOn(app.aiProcessingQueue, 'add');
        } else {
            throw new Error("app.aiProcessingQueue decorator not found. Check BullMQ plugin registration.");
        }
    });

    afterAll(async () => {
        await app.close();
        await cleanupDummyFiles(TEST_TEMP_DIR);
    });

    beforeEach(async () => {
        queueSpy.mockReset();
        await cleanupTestDatabase();
        await cleanupDummyFiles(TEST_TEMP_DIR);
    });

    async function getAuthCookie(): Promise<string> {
        const loginResponse = await request(app.server)
            .post('/test/login')
            .send({ accessToken: 'upload-test-token', expiresAt: Date.now() + 3600000 });
        expect(loginResponse.status).toBe(200);
        const cookiesHeader = loginResponse.headers['set-cookie'];
        let sessionCookie = Array.isArray(cookiesHeader) ? cookiesHeader.find(c => c.startsWith('sessionId=')) : (typeof cookiesHeader === 'string' && cookiesHeader.startsWith('sessionId=') ? cookiesHeader : undefined);
        expect(sessionCookie).toBeDefined();
        return sessionCookie as string;
    }

    describe('/api/upload', () => {

        it('should return 401 Unauthorized if user is not logged in', async () => {
            await createDummyFile(DUMMY_FILE_1);
            const response = await request(app.server)
                .post('/api/upload')
                .attach('files', DUMMY_FILE_1);

            expect(response.status).toBe(401);
            expect(response.body?.message).toMatch(/Invalid session or token expired/i);
            expect(queueSpy).not.toHaveBeenCalled();
        });

        it('should return 406 Not Acceptable if request is not multipart', async () => {
            const sessionCookie = await getAuthCookie();
            const response = await request(app.server)
                .post('/api/upload')
                .set('Cookie', sessionCookie);

            expect(response.status).toBe(406);
            expect(queueSpy).not.toHaveBeenCalled();
        });


        it('should return 200 OK and add job to queue for valid file(s)', async () => {
            const sessionCookie = await getAuthCookie();
            await createDummyFile(DUMMY_FILE_1, 100);
            await createDummyFile(DUMMY_FILE_2, 200);
            queueSpy.mockResolvedValue({ id: 'test-job-id-123' });

            const response = await request(app.server)
                .post('/api/upload')
                .set('Cookie', sessionCookie)
                .attach('files', DUMMY_FILE_1)
                .attach('files', DUMMY_FILE_2);

            expect(response.status).toBe(200);
            expect(response.body).toEqual({
                success: true,
                message: expect.stringMatching(/Upload received for 2 file\(s\)/i),
            });

            expect(queueSpy).toHaveBeenCalledTimes(1);
            const [jobName, jobData, jobOptions] = queueSpy.mock.calls[0];

            expect(jobName).toEqual('process-images');
            expect(jobData).toBeDefined();
            expect(jobData.sessionId).toEqual(expect.any(String));
            expect(jobData.originalFilenames).toHaveLength(2);
            expect(jobData.tempFilePaths).toHaveLength(2);
            expect(jobData.mimeTypes).toHaveLength(2);
            expect(jobData.originalFilenames).toEqual(expect.arrayContaining([
                path.basename(DUMMY_FILE_1),
                path.basename(DUMMY_FILE_2)
            ]));
            expect(jobData.tempFilePaths[0]).toContain(TEST_TEMP_DIR);
            expect(jobData.tempFilePaths[1]).toContain(TEST_TEMP_DIR);
            expect(jobOptions).toBeUndefined();

            await expect(fs.access(jobData.tempFilePaths[0])).resolves.toBeUndefined();
            await expect(fs.access(jobData.tempFilePaths[1])).resolves.toBeUndefined();
        });

        it(`should return 413 Payload Too Large if number of files exceeds limit (${MAX_FILES})`, async () => {
            const sessionCookie = await getAuthCookie();
            const filesToAttach: string[] = [];
            for (let i = 0; i <= MAX_FILES; i++) {
                const filePath = path.join(TEST_TEMP_DIR, `exceed-limit-${i}.txt`);
                await createDummyFile(filePath, 10);
                filesToAttach.push(filePath);
                filesToCleanup.push(filePath);
            }

            const req = request(app.server)
                .post('/api/upload')
                .set('Cookie', sessionCookie);
            filesToAttach.forEach(f => req.attach('files', f));
            const response = await req;

            expect(response.status).toBe(413);
            expect(queueSpy).not.toHaveBeenCalled();
        });


        it(`should return 413 Payload Too Large if a file size exceeds server limit`, async () => {
            const sessionCookie = await getAuthCookie();
            await createDummyFile(DUMMY_FILE_LARGE, MAX_SIZE_BYTES + 1);

            const response = await request(app.server)
                .post('/api/upload')
                .set('Cookie', sessionCookie)
                .attach('files', DUMMY_FILE_LARGE);

            expect(response.status).toBe(413);
            expect(queueSpy).not.toHaveBeenCalled();
        });


        it('should return 500 Internal Server Error if adding job to queue fails', async () => {
            const sessionCookie = await getAuthCookie();
            await createDummyFile(DUMMY_FILE_1);

            const queueError = new Error("Redis connection lost");
            queueSpy.mockRejectedValueOnce(queueError);

            const response = await request(app.server)
                .post('/api/upload')
                .set('Cookie', sessionCookie)
                .attach('files', DUMMY_FILE_1);

            expect(response.status).toBe(500);
            expect(response.body.error).toEqual('Internal Server Error');
            expect(response.body.message).toEqual('An unexpected error occurred on the server.');
            expect(queueSpy).toHaveBeenCalledTimes(1);
        });

    });

});