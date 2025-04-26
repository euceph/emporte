/**
 * parses a time string (e.g., "09:00 AM", "01:30 PM") into minutes since midnight
 * returns NaN if the format is invalid
 */
export const parseTimeToMinutes = (timeString: string | null | undefined): number => {
    if (!timeString) {
        return NaN;
    }

    const match = timeString.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);

    if (!match) {
        return NaN;
    }

    let hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    const period = match[3].toUpperCase();

    if (isNaN(hours) || isNaN(minutes) || hours < 1 || hours > 12 || minutes < 0 || minutes > 59) {
        return NaN;
    }

    if (hours === 12) {
        hours = period === 'AM' ? 0 : 12;
    } else if (period === 'PM') {
        hours += 12;
    }

    if (hours < 0 || hours > 23) {
        return NaN;
    }

    return hours * 60 + minutes;
};

/**
 * formats minutes since midnight into a time string (e.g., "9:00 AM", "1:30 PM")
 * optionally includes leading zero for hours
 */
export const formatMinutesToTime = (totalMinutes: number, includeLeadingZero = false): string => {
    if (isNaN(totalMinutes) || totalMinutes < 0 || totalMinutes >= 24 * 60) {
        return "Invalid Time";
    }

    const hours24 = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    const period = hours24 >= 12 ? 'PM' : 'AM';
    let hours12 = hours24 % 12;
    if (hours12 === 0) {
        hours12 = 12;
    }

    const formattedHours = includeLeadingZero ? String(hours12).padStart(2, '0') : String(hours12);
    const formattedMinutes = String(minutes).padStart(2, '0');

    return `${formattedHours}:${formattedMinutes} ${period}`;
};


export const getDayIndex = (dayName: string): number => {
    const lowerDay = dayName.toLowerCase();
    switch (lowerDay) {
        case 'monday': return 0;
        case 'tuesday': return 1;
        case 'wednesday': return 2;
        case 'thursday': return 3;
        case 'friday': return 4;
        default: return -1;
    }
};
