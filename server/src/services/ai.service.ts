import {
    GoogleGenAI,
    GenerationConfig,
    Part,
    GenerateContentResponse
} from "@google/genai";

import { FastifyBaseLogger } from 'fastify';
import dotenv from 'dotenv';

dotenv.config();

const API_KEY = process.env.GEMINI_API_KEY;

const MODEL_NAME = "gemini-2.0-flash";


if (!API_KEY) {
    console.error("Critical Error: GEMINI_API_KEY environment variable is not set.");
    throw new Error("GEMINI_API_KEY must be defined");
}



const genAI = new GoogleGenAI({apiKey: API_KEY});



const generationConfigData: GenerationConfig = {
    temperature: 0.2,
    topK: 1,
    topP: 1,
    maxOutputTokens: 8192,
    responseMimeType: "application/json",
};


/**
 * extracts schedule information from an image using Gemini AI.
 *
 * @param base64Data base64 encoded string of the image data.
 * @param mimeType MIME type of the image (e.g., 'image/png', 'image/jpeg')
 * @param logger Fastify logger for context
 * @param originalFilename filename for logging
 * @returns parsed JSON schedule data from the AI
 */
export const extractScheduleFromImage = async (

    base64Data: string,
    mimeType: string,
    logger: FastifyBaseLogger,
    originalFilename?: string

): Promise<any> => {

    if (!base64Data) {
        logger.error({ filename: originalFilename }, "AI Service Error: Base64 data is missing.");
        throw new Error("Base64 image data must be provided.");
    }
    if (!mimeType) {
        logger.error({ filename: originalFilename }, "AI Service Error: Mime type is missing.");
        throw new Error("Image MIME type must be provided.");
    }

    const logContext = { mimeType, filename: originalFilename, dataLength: base64Data.length };
    logger.info(logContext, "Starting schedule extraction from base64 image data...");


    const textPrompt = `
Analyze the provided schedule image (e.g., a screenshot). Extract the following details for each distinct course or section shown:
- courseCode: The course code (e.g., "CS 101", "MATH 2B"). Use a string value.
- courseName: The full or shortened name of the course (e.g., "Intro to Computer Science," "Intro CS"). Use null if not clearly present.
- sectionDetails: Any section identifier like number, type (Lecture, Lab, Discussion, Seminar). Use null if not distinct or applicable.
- days: An array of strings for the days of the week it occurs (e.g., ["Monday", "Wednesday", "Friday"], ["Tuesday", "Thursday"], ["Monday"]). Use full day names. Must contain at least one day.
- startTime: The start time in HH:MM AM/PM format (e.g., "09:00 AM", "01:30 PM"). Must be a valid time string.
- endTime: The end time in HH:MM AM/PM format (e.g., "09:50 AM", "04:20 PM"). Must be a valid time string.
- location: The building and room number or description (e.g., "Tech Hall 301", "Online"). Use null if not present.

Also, if the schedule clearly shows start and end dates for the entire term or semester (e.g., "Sept 20 - Dec 10", "Fall 2025: 9/20/25 - 12/10/25"), extract them.

Respond ONLY with a single, valid JSON object matching this exact structure:
{
  "termStartDate": "YYYY-MM-DD" | null,
  "termEndDate": "YYYY-MM-DD" | null,
  "scheduleEvents": [
    {
      "courseCode": "string",
      "courseName": "string" | null,
      "sectionDetails": "string" | null,
      "days": ["string"],
      "startTime": "string",
      "endTime": "string",
      "location": "string" | null
    },
    // ... more events if present
  ]
}

Ensure dates are in YYYY-MM-DD format. Use null for term dates if they are not clearly identifiable in the image.
Ensure times strictly follow HH:MM AM/PM format.
If any detail for a specific event (like courseName, sectionDetails, location) is unclear or missing in the image, use null for that field. Do not guess or invent data.
Focus solely on extracting the information requested in the specified JSON format.
`.trim();



    const imagePart: Part = {
        inlineData: {
            data: base64Data,
            mimeType: mimeType,
        },
    };
    const parts: Part[] = [{ text: textPrompt }, imagePart];


    logger.info(logContext, "Sending request to Gemini API...");
    try {

        const result: GenerateContentResponse = await genAI.models.generateContent({
            model: MODEL_NAME,
            contents: [{ role: "user", parts }],



            config: generationConfigData,

        });



        const responseText = result.text;

        logger.info(logContext, "Received response text property from Gemini API.");

        if (responseText === undefined || responseText === null || responseText === "") {
            logger.error({response: result}, "Gemini API response text is empty or undefined.");
            const blockReason = result.promptFeedback?.blockReason;
            const safetyRatings = result.candidates?.[0]?.safetyRatings;
            const finishReason = result.candidates?.[0]?.finishReason;
            logger.warn({blockReason, safetyRatings, finishReason, ...logContext}, "Potential content blocking detected.");
            throw new Error(`AI model returned empty text. Block Reason: ${blockReason || 'N/A'}, Finish Reason: ${finishReason || 'N/A'}`);
        }


        let scheduleData: any;
        try {
            scheduleData = JSON.parse(responseText);
            logger.info(logContext, "Successfully parsed JSON response from Gemini API.");
        } catch (parseError: any) {
            logger.error({ err: parseError, responseText: responseText.substring(0, 500) + '...', ...logContext }, "Failed to parse responseText as JSON.");
            throw new Error(`AI response was not valid JSON.`);
        }

        // TODO: add Zod validation here before returning using schema

        return scheduleData;

    } catch (error: unknown) {
        logger.error({ err: error, ...logContext }, "Error during Gemini API call or processing.");

        throw error;
    }
};