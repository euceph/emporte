import React, { useEffect, useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { parse, format, getHours, getMinutes, isValid } from 'date-fns';

interface TimeSelectProps {
    value?: string | null;
    onChange: (value: string | null) => void;
    disabled?: boolean;
    className?: string;
}

const generateOptions = (max: number, step: number = 1, pad: number = 2): string[] => {
    return Array.from({ length: Math.floor(max / step) + (max % step === 0 ? 0 : 0) }, (_, i) =>
        String(i * step).padStart(pad, '0')
    );
};
const generateHourOptions = (): string[] => {
    return Array.from({ length: 12 }, (_, i) => String(i + 1));
}

const hourOptions = generateHourOptions();
const minuteOptions = generateOptions(59, 5, 2);
const periodOptions = ['AM', 'PM'];

const parseInitialTime = (value: string | null | undefined) => {
    let initialHour: string | undefined = undefined;
    let initialMinute: string | undefined = undefined;
    let initialPeriod: string | undefined = undefined;

    if (value) {
        try {
            const refDate = new Date();
            const parsed = parse(value, 'h:mm a', refDate);
            if (isValid(parsed)) {
                let h = getHours(parsed);
                const m = getMinutes(parsed);
                const p = h >= 12 ? 'PM' : 'AM';
                h = h % 12;
                if (h === 0) h = 12;

                initialHour = String(h);
                const closestMinute = minuteOptions.reduce((prev, curr) =>
                    Math.abs(parseInt(curr) - m) < Math.abs(parseInt(prev) - m) ? curr : prev
                );
                initialMinute = closestMinute;
                initialPeriod = p;
            }
        } catch (e) {
            console.error("Error parsing initial time value:", value, e);
        }
    }
    return { initialHour, initialMinute, initialPeriod };
};

export const TimeSelect: React.FC<TimeSelectProps> = ({
                                                          value,
                                                          onChange,
                                                          disabled,
                                                          className,
                                                      }) => {
    const { initialHour, initialMinute, initialPeriod } = parseInitialTime(value);
    const [hour, setHour] = useState<string | undefined>(initialHour);
    const [minute, setMinute] = useState<string | undefined>(initialMinute);
    const [period, setPeriod] = useState<string | undefined>(initialPeriod);

    useEffect(() => {
        const { initialHour, initialMinute, initialPeriod } = parseInitialTime(value);
        setHour(initialHour);
        setMinute(initialMinute);
        setPeriod(initialPeriod);
    }, [value]);

    const handleTimeChange = (newHour?: string, newMinute?: string, newPeriod?: string) => {
        const currentHour = newHour ?? hour;
        const currentMinute = newMinute ?? minute;
        const currentPeriod = newPeriod ?? period;

        if (currentHour && currentMinute && currentPeriod) {
            try {
                const timeStr = `${currentHour}:${currentMinute} ${currentPeriod}`;
                const parsedDate = parse(timeStr, 'h:mm a', new Date());
                if (isValid(parsedDate)) {
                    onChange(format(parsedDate, 'h:mm a'));
                } else {
                    onChange(null);
                }
            } catch {
                onChange(null);
            }
        } else {
            onChange(null);
        }
    };

    return (
        <div className={cn("flex items-center space-x-0.5", className)}>
            <Select
                value={hour}
                onValueChange={(h) => handleTimeChange(h, undefined, undefined) }
                disabled={disabled}
            >
                <SelectTrigger className={cn(
                    "h-8 text-sm w-[35px]",
                    "px-1",
                    "[&>svg]:hidden",
                    "justify-center text-center",
                    !hour && "text-muted-foreground"
                )}>
                    <SelectValue placeholder="HH" />
                </SelectTrigger>
                <SelectContent>
                    {hourOptions.map(opt => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
                </SelectContent>
            </Select>

            <span className="text-sm text-muted-foreground pt-0.5">:</span>

            <Select
                value={minute}
                onValueChange={(m) => handleTimeChange(undefined, m, undefined)}
                disabled={disabled}
            >
                <SelectTrigger className={cn(
                    "h-8 text-sm w-[35px]",
                    "px-1",
                    "[&>svg]:hidden",
                    "justify-center text-center",
                    !minute && "text-muted-foreground"
                )}>
                    <SelectValue placeholder="MM" />
                </SelectTrigger>
                <SelectContent>
                    {minuteOptions.map(opt => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
                </SelectContent>
            </Select>

            <Select
                value={period}
                onValueChange={(p) => handleTimeChange(undefined, undefined, p)}
                disabled={disabled}
            >
                <SelectTrigger className={cn(
                    "h-8 text-sm w-[45px]",
                    "px-1",
                    "[&>svg]:hidden",
                    "justify-center text-center",
                    !period && "text-muted-foreground"
                )}>
                    <SelectValue placeholder="AM/PM"/>
                </SelectTrigger>
                <SelectContent>
                    {periodOptions.map(opt => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
                </SelectContent>
            </Select>
        </div>
    );
};
