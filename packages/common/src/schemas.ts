import {z} from "zod";

const dateStringSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format, expected YYYY-MM-DD");

export const scheduleEventSchema = z.object({
    courseCode: z.string(),
    courseName: z.string().nullable(),
    sectionDetails: z.string().nullable(),
    days: z.array(z.string()).min(1),
    startTime: z.string().regex(/\d{1,2}:\d{2}\s*(AM|PM)/i, "Invalid start time format"),
    endTime: z.string().regex(/\d{1,2}:\d{2}\s*(AM|PM)/i, "Invalid end time format"),
    location: z.string().nullable(),
});
export type ScheduleEvent = z.infer<typeof scheduleEventSchema>;

export const scheduleDataSchema = z.object({
    termStartDate: dateStringSchema.nullable(),
    termEndDate: dateStringSchema.nullable(),
    scheduleEvents: z.array(scheduleEventSchema),
});
export type ScheduleData = z.infer<typeof scheduleDataSchema>;

export const createCalendarBodySchema = scheduleDataSchema.extend({
    userTimeZone: z.string().min(3, "Timezone is required")
        .refine((tz: string) => {
            try {

                Intl.DateTimeFormat(undefined, { timeZone: tz });
                return true;
            } catch (ex) {
                return false;
            }
        }, {
            message: "Invalid IANA time zone identifier provided (e.g., 'America/New_York')",
        })
});
export type CreateCalendarBody = z.infer<typeof createCalendarBodySchema>;

export const processingErrorSchema = z.object({
    filename: z.string(),
    error: z.string(),
});
export type ProcessingError = z.infer<typeof processingErrorSchema>;

export const processingWarningSchema = z.object({
    filename: z.string().optional(),
    message: z.string(),
    field: z.string().optional(),
    value: z.any().optional(),
});
export type ProcessingWarning = z.infer<typeof processingWarningSchema>;

export const previewResultSchema = z.object({
    scheduleData: scheduleDataSchema,
    processingWarnings: z.array(processingWarningSchema).default([]),
    processingErrors: z.array(processingErrorSchema).default([]),
});
export type PreviewResult = z.infer<typeof previewResultSchema>;
