import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import type { extractScheduleFromImage as ExtractScheduleFunc } from '../../services/ai.service';
import type { FastifyBaseLogger } from 'fastify';

const mockGenerateContent = vi.fn();

const mockGenAIInstance = {
    models: {
        generateContent: mockGenerateContent,
    },
};

vi.doMock('@google/genai', () => {
    return {
        GoogleGenAI: vi.fn(() => mockGenAIInstance),
    };
});

const mockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => mockLogger),
} as unknown as FastifyBaseLogger;

describe('ai.service: extractScheduleFromImage', () => {
    let extractScheduleFromImage: typeof ExtractScheduleFunc;

    beforeAll(async () => {
        const serviceModule = await import('../../services/ai.service');
        extractScheduleFromImage = serviceModule.extractScheduleFromImage;
    });

    beforeEach(() => {
        vi.clearAllMocks();
    });

    const validBase64 = 'valid-base64-string';
    const validMimeType = 'image/png';

    it('should call generateContent with correct args and parse valid JSON response', async () => {
        const mockApiResponse = {
            text: JSON.stringify({
                termStartDate: '2024-01-01',
                termEndDate: '2024-05-01',
                scheduleEvents: [{ courseCode: 'TEST 101' }],
            }),
            promptFeedback: { blockReason: null },
            candidates: [{ safetyRatings: [], finishReason: 'STOP' }],
        };
        mockGenerateContent.mockResolvedValue(mockApiResponse);

        const result = await extractScheduleFromImage(validBase64, validMimeType, mockLogger, 'test.png');

        expect(mockGenerateContent).toHaveBeenCalledOnce();
        const callArgs = mockGenerateContent.mock.calls[0][0];
        expect(callArgs.model).toBeDefined();
        expect(callArgs.contents[0].parts[0].text).toContain('Analyze the provided schedule image');
        expect(callArgs.contents[0].parts[1].inlineData.data).toBe(validBase64);
        expect(callArgs.contents[0].parts[1].inlineData.mimeType).toBe(validMimeType);
        expect(callArgs.config).toEqual({
            temperature: 0.2, topK: 1, topP: 1, maxOutputTokens: 8192, responseMimeType: "application/json",
        });
        expect(result).toEqual({
            termStartDate: '2024-01-01',
            termEndDate: '2024-05-01',
            scheduleEvents: [{ courseCode: 'TEST 101' }],
        });
        expect(mockLogger.error).not.toHaveBeenCalled();
    });

    it('should throw an error if base64 data is missing', async () => {
        await expect(extractScheduleFromImage('', validMimeType, mockLogger))
            .rejects.toThrow('Base64 image data must be provided.');
        expect(mockGenerateContent).not.toHaveBeenCalled();
        expect(mockLogger.error).toHaveBeenCalledWith(expect.anything(), "AI Service Error: Base64 data is missing.");
    });

    it('should throw an error if mime type is missing', async () => {
        await expect(extractScheduleFromImage(validBase64, '', mockLogger))
            .rejects.toThrow('Image MIME type must be provided.');
        expect(mockGenerateContent).not.toHaveBeenCalled();
        expect(mockLogger.error).toHaveBeenCalledWith(expect.anything(), "AI Service Error: Mime type is missing.");
    });

    it('should throw an error if API returns empty text response', async () => {
        const mockApiResponse = {
            text: '', promptFeedback: { blockReason: 'SAFETY' }, candidates: [{ finishReason: 'SAFETY' }],
        };
        mockGenerateContent.mockResolvedValue(mockApiResponse);

        await expect(extractScheduleFromImage(validBase64, validMimeType, mockLogger))
            .rejects.toThrow(/AI model returned empty text/);
        expect(mockGenerateContent).toHaveBeenCalledOnce();
        expect(mockLogger.error).toHaveBeenCalledWith(expect.objectContaining({ response: mockApiResponse }), "Gemini API response text is empty or undefined.");
        expect(mockLogger.warn).toHaveBeenCalledWith(expect.objectContaining({ blockReason: 'SAFETY', finishReason: 'SAFETY' }), "Potential content blocking detected.");
    });

    it('should throw an error if API response text is not valid JSON', async () => {
        const mockApiResponse = {
            text: 'Invalid JSON {', promptFeedback: null, candidates: [{ finishReason: 'STOP' }],
        };
        mockGenerateContent.mockResolvedValue(mockApiResponse);

        await expect(extractScheduleFromImage(validBase64, validMimeType, mockLogger))
            .rejects.toThrow('AI response was not valid JSON.');
        expect(mockGenerateContent).toHaveBeenCalledOnce();
        expect(mockLogger.error).toHaveBeenCalledWith(expect.objectContaining({ responseText: expect.stringContaining('Invalid JSON {') }), "Failed to parse responseText as JSON.");
    });

    it('should throw an error if the generateContent call itself fails', async () => {
        const apiError = new Error('API Network Error');
        mockGenerateContent.mockRejectedValue(apiError);

        await expect(extractScheduleFromImage(validBase64, validMimeType, mockLogger))
            .rejects.toThrow('API Network Error');
        expect(mockGenerateContent).toHaveBeenCalledOnce();
        expect(mockLogger.error).toHaveBeenCalledWith(expect.objectContaining({ err: apiError }), "Error during Gemini API call or processing.");
    });
});