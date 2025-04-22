import { google, calendar_v3 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { FastifyBaseLogger } from 'fastify';
import { parseTimeToMinutes } from '@emporte/common';
import pLimit from 'p-limit';
import { format } from 'date-fns-tz';


interface ScheduleEvent {
    courseCode: string;
    courseName: string | null;
    sectionDetails: string | null;
    days: string[];
    startTime: string;
    endTime: string;
    location: string | null;
}

interface ScheduleData {
    termStartDate: string | null;
    termEndDate: string | null;
    scheduleEvents: ScheduleEvent[];
}

type GoogleCalendarEvent = calendar_v3.Schema$Event;


const dayNameToRRULE: { [key: string]: string } = {
    monday: 'MO', tuesday: 'TU', wednesday: 'WE', thursday: 'TH',
    friday: 'FR', saturday: 'SA', sunday: 'SU',
};

const GOOGLE_COLOR_IDS: string[] = [
    "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11",
];

/**
 * formats the extracted schedule data into Google Calendar API event objects,
 * using the provided user timezone and RFC3339 dateTime format
 */
export const formatEventsForGoogle = (
    scheduleData: ScheduleData,
    userTimeZone: string,
    logger: FastifyBaseLogger
): GoogleCalendarEvent[] => {
    const { scheduleEvents, termStartDate, termEndDate } = scheduleData;



    try {
        Intl.DateTimeFormat(undefined, { timeZone: userTimeZone });
        logger.info({ userTimeZone }, "User timezone is valid.");
    } catch (e) {
        logger.error({ providedTimeZone: userTimeZone }, "Invalid IANA user timezone provided for formatting.");
        throw new Error(`Invalid user timezone ('${userTimeZone}') provided. Cannot format events accurately.`);
    }

    logger.info({ termStartDate, termEndDate }, "Formatting events for Google Calendar...");


    const courseColorMap = new Map<string, string>();
    const availableColors = [...GOOGLE_COLOR_IDS];
    let fallbackColorIndex = 0;


    if (!termStartDate || !termEndDate) {
        logger.error("Cannot format events: Missing term start or end date.");
        throw new Error("Term start and end dates are required to create recurring events.");
    }

    const termStart = new Date(`${termStartDate}T00:00:00`);
    const termEndDayStart = new Date(`${termEndDate}T00:00:00`);

    if (isNaN(termStart.getTime()) || isNaN(termEndDayStart.getTime())) {
        logger.error({ termStartDate, termEndDate }, "Invalid term date format detected.");
        throw new Error("Invalid term start or end date format. Please use YYYY-MM-DD.");
    }

    const untilDate = new Date(termEndDayStart);
    untilDate.setDate(untilDate.getDate() + 1);
    const rruleEndDateUTC = untilDate.toISOString().split('T')[0].replace(/-/g, '') + 'T000000Z';


    const googleEvents: GoogleCalendarEvent[] = [];
    scheduleEvents.forEach((event, index) => {
        try {

            if (!event.days || event.days.length === 0) { logger.warn({ eventIndex: index, eventSummary: event.courseCode }, "Skipping event: Missing 'days'."); return; }
            if (!event.startTime || !event.endTime) { logger.warn({ eventIndex: index, eventSummary: event.courseCode }, "Skipping event: Missing times."); return; }
            if (!event.courseCode) { logger.warn({ eventIndex: index }, "Skipping event color: Missing courseCode."); }

            const startMinutes = parseTimeToMinutes(event.startTime);
            const endMinutes = parseTimeToMinutes(event.endTime);
            const daysOfWeek = event.days.map(d => d.toLowerCase()).filter(d => dayNameToRRULE[d]);

            if (daysOfWeek.length === 0 || isNaN(startMinutes) || isNaN(endMinutes)) { logger.warn({ eventIndex: index, eventSummary: event.courseCode }, "Skipping event: Invalid time/day."); return; }
            if (startMinutes >= endMinutes) { logger.warn({ eventIndex: index, eventSummary: event.courseCode }, "Skipping event: Start >= End."); return; }


            const firstOccurrence = new Date(termStart);
            const startDayOfWeek = termStart.getDay();
            let daysToAdd = 7;
            for (const dayName of daysOfWeek) {
                const targetDayIndex = Object.keys(dayNameToRRULE).indexOf(dayName);
                const currentDayIndex = (startDayOfWeek === 0) ? 6 : startDayOfWeek - 1;
                let diff = targetDayIndex - currentDayIndex;
                if (diff < 0) diff += 7;
                daysToAdd = Math.min(daysToAdd, diff);
            }

            if (daysToAdd === 7) { logger.error({ eventIndex: index, eventSummary: event.courseCode }, "Could not determine first occurrence day."); return; }
            firstOccurrence.setDate(firstOccurrence.getDate() + daysToAdd);


            const startDateTime = new Date(firstOccurrence);
            startDateTime.setHours(Math.floor(startMinutes / 60), startMinutes % 60, 0, 0);
            const endDateTime = new Date(firstOccurrence);
            endDateTime.setHours(Math.floor(endMinutes / 60), endMinutes % 60, 0, 0);

            if (startDateTime >= untilDate) { logger.warn({ eventIndex: index, eventSummary: event.courseCode }, "Skipping event: First occurrence after term end."); return; }


            const rruleDays = daysOfWeek.map(d => dayNameToRRULE[d]).join(',');
            const recurrenceRule = `RRULE:FREQ=WEEKLY;BYDAY=${rruleDays};UNTIL=${rruleEndDateUTC}`;


            let eventColorId: string | undefined = undefined;
            if (event.courseCode && courseColorMap.has(event.courseCode)) {
                eventColorId = courseColorMap.get(event.courseCode);
            } else if (event.courseCode) {
                let assignedColor: string;
                if (availableColors.length > 0) {
                    const randomIndex = Math.floor(Math.random() * availableColors.length);
                    assignedColor = availableColors.splice(randomIndex, 1)[0];
                } else {
                    assignedColor = GOOGLE_COLOR_IDS[fallbackColorIndex % GOOGLE_COLOR_IDS.length];
                    fallbackColorIndex++;
                }
                courseColorMap.set(event.courseCode, assignedColor);
                eventColorId = assignedColor;
            }




            const startDateTimeRFC3339 = format(startDateTime, "yyyy-MM-dd'T'HH:mm:ssXXX", { timeZone: userTimeZone });
            const endDateTimeRFC3339 = format(endDateTime, "yyyy-MM-dd'T'HH:mm:ssXXX", { timeZone: userTimeZone });



            const googleEvent: GoogleCalendarEvent = {
                summary: `${event.courseCode}${event.sectionDetails ? ` (${event.sectionDetails})` : ''}${event.courseName ? ` - ${event.courseName}` : ''}`,
                location: event.location ?? undefined,
                description: `Course: ${event.courseCode || 'N/A'}\nSection: ${event.sectionDetails || 'N/A'}\nName: ${event.courseName || 'N/A'}`,
                start: {

                    dateTime: startDateTimeRFC3339,
                    timeZone: userTimeZone,
                },
                end: {

                    dateTime: endDateTimeRFC3339,
                    timeZone: userTimeZone,
                },
                recurrence: [recurrenceRule],
                reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 15 }] },
                colorId: eventColorId,
            };
            googleEvents.push(googleEvent);

        } catch (error: unknown) {

            logger.error({ err: error, eventIndex: index, eventSummary: event.courseCode }, "Error formatting single event.");
        }
    });

    logger.info(`Formatted ${googleEvents.length} out of ${scheduleEvents.length} potential events using timezone ${userTimeZone}.`);
    return googleEvents;
};


/**
 * creates multiple events in the user's primary Google Calendar concurrently,
 * respecting a concurrency limit to avoid API rate limits
 */
export const createCalendarEvents = async (
    accessToken: string,
    events: GoogleCalendarEvent[],
    logger: FastifyBaseLogger
): Promise<{ successCount: number; errors: any[] }> => {


    const CONCURRENCY = parseInt(process.env.GOOGLE_API_CONCURRENCY || '5', 10);
    const limit = pLimit(CONCURRENCY);
    logger.info({ eventCount: events.length, concurrency: CONCURRENCY }, `Attempting to create events concurrently...`);


    const oauth2Client = new OAuth2Client();
    oauth2Client.setCredentials({ access_token: accessToken });
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });


    const insertPromises = events.map((event, index) => {
        return limit(async () => {
            logger.debug({ eventIndex: index, eventSummary: event.summary }, "Submitting event insertion task...");
            try {
                const response = await calendar.events.insert({
                    calendarId: 'primary',
                    requestBody: event,
                });
                logger.debug({ eventIndex: index, eventId: response.data.id, status: response.status }, "Event insertion task succeeded.");
                return { status: 'fulfilled', index };
            } catch (error: any) {
                const errorMessage = error?.response?.data?.error?.message || error?.message || 'Unknown error during event insertion';
                const errorStatus = error?.response?.status;
                logger.error({ err: { message: errorMessage, status: errorStatus }, eventIndex: index, eventSummary: event.summary }, "Event insertion task failed.");
                throw {
                    status: 'rejected',
                    index,
                    eventSummary: event.summary,
                    error: errorMessage,
                    statusCode: errorStatus,
                };
            }
        });
    });


    const results = await Promise.allSettled(insertPromises);
    let successCount = 0;
    const errors: any[] = [];

    results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
            successCount++;
        } else {
            const reason = result.reason;
            logger.warn({ reason }, `Event creation failed for original index ${reason.index || index}`);
            errors.push({
                eventSummary: reason.eventSummary || events[index]?.summary || `Event ${index}`,
                error: reason.error || 'Unknown failure reason',
                status: reason.statusCode,
            });
        }
    });

    logger.info(`Concurrent calendar creation complete. Success: ${successCount}, Failures: ${errors.length}`);
    return { successCount, errors };
};
