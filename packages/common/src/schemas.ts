// --- zod schemas ---
import {z} from "zod";

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
    termStartDate: z.string().nullable(),
    termEndDate: z.string().nullable(),
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
