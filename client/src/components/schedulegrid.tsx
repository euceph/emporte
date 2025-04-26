import React, {useEffect, useMemo, useState} from 'react';
import {cn} from "@/lib/utils";
import {parseTimeToMinutes, formatMinutesToTime, getDayIndex} from '@emporte/common';
import {type ScheduleData, type ScheduleEvent} from '@emporte/common';
import {Card} from '@/components/ui/card';
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import {ToggleGroup, ToggleGroupItem} from "@/components/ui/toggle-group";
import {TimeSelect} from "@/components/ui/timeselect";
import {Edit3} from 'lucide-react';
import {toast} from 'sonner';
import {motion} from 'framer-motion';

interface ScheduleGridProps {
    scheduleData: ScheduleData;
    onUpdateEvent: (index: number, updatedEventData: ScheduleEvent) => void;
}


const colorPairs = [

    {bg: 'bg-cyan-500', text: 'text-white', border: 'border-cyan-600'},
    {bg: 'bg-fuchsia-500', text: 'text-white', border: 'border-fuchsia-600'},
    {bg: 'bg-violet-500', text: 'text-white', border: 'border-violet-600'},
    {bg: 'bg-emerald-500', text: 'text-white', border: 'border-emerald-600'},
    {bg: 'bg-pink-500', text: 'text-white', border: 'border-pink-600'},
    {bg: 'bg-teal-500', text: 'text-white', border: 'border-teal-600'},
    {bg: 'bg-red-500', text: 'text-white', border: 'border-red-600'},
    {bg: 'bg-sky-500', text: 'text-white', border: 'border-sky-600'},
    {bg: 'bg-rose-500', text: 'text-white', border: 'border-rose-600'},
    {bg: 'bg-indigo-500', text: 'text-white', border: 'border-indigo-600'},
];
type ColorPair = typeof colorPairs[0];

const DAY_INITIALS: { [key: string]: string } = {
    "Monday": "M",
    "Tuesday": "T",
    "Wednesday": "W",
    "Thursday": "T",
    "Friday": "F",
};
const ALL_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const SHORT_DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI'];

const getBaseCourseCode = (courseCode: string | null | undefined): string => {
    if (!courseCode) return '';
    const match = courseCode.match(/^([A-Z]+(?:-|\s)?\d+[A-Z]?)/i);
    return match ? match[1].toUpperCase().replace(/\s|-/g, '') : courseCode.toUpperCase();
};

interface EventEditFormProps {
    event: ScheduleEvent;
    originalIndex: number;
    onSave: (index: number, updatedData: ScheduleEvent) => void;
    onClose: () => void;
}


const containerVariants = {
    hidden: {opacity: 0},
    visible: {
        opacity: 1,
        transition: {

            delayChildren: 0.1,
            staggerChildren: 0.12,
        }
    }
};


const itemVariants = {
    hidden: {opacity: 0, scale: 0.90, y: 10},
    visible: {opacity: 1, scale: 1, y: 0, transition: {duration: 0.2, ease: "easeOut"}}
};

const EventEditForm: React.FC<EventEditFormProps> = ({event, originalIndex, onSave, onClose}) => {
    const [formData, setFormData] = useState<ScheduleEvent>({...event});
    const [selectedDays, setSelectedDays] = useState<string[]>(() => [...(event.days || [])]);


    const handleTimeChange = (field: 'startTime' | 'endTime', value: string | null) => {
        setFormData(prev => ({
            ...prev,
            [field]: value
        }));
    };


    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const {name, value} = e.target;

        const newValue = (name === 'courseName' || name === 'sectionDetails' || name === 'location') && value === ''
            ? null
            : value;
        setFormData(prev => ({...prev, [name]: newValue}));
    };


    const handleDaysToggleChange = (newSelectedDays: string[]) => {

        const sortedDays = newSelectedDays.sort((a, b) => ALL_DAYS.indexOf(a) - ALL_DAYS.indexOf(b));
        setSelectedDays(sortedDays);

        setFormData(prev => ({...prev, days: sortedDays}));
    };


    const handleSaveChanges = (e: React.FormEvent) => {
        e.preventDefault();

        if (!formData.startTime) {
            toast.error("Missing Start Time", {description: "Please select a start time."});
            return;
        }
        if (!formData.endTime) {
            toast.error("Missing End Time", {description: "Please select an end time."});
            return;
        }
        if (!formData.days || formData.days.length === 0) {
            toast.error("Missing Days", {description: "Please select at least one day."});
            return;
        }

        const startMins = parseTimeToMinutes(formData.startTime);
        const endMins = parseTimeToMinutes(formData.endTime);


        if (isNaN(startMins) || isNaN(endMins) || startMins >= endMins) {
            toast.error("Invalid Time Range", {description: "Start time must be before end time."});
            return;
        }

        onSave(originalIndex, {
            ...formData,
            startTime: formData.startTime,
            endTime: formData.endTime,
        });
        onClose();
    };


    return (
        <form onSubmit={handleSaveChanges} className="space-y-4">

            <div className="text-center mb-3">
                <h4 className="font-medium text-lg leading-none">Edit Event</h4>
            </div>


            <div className="space-y-3 px-1">
                <div className="grid gap-1.5">
                    <Label htmlFor={`courseCode-${originalIndex}`}
                           className="text-xs font-medium text-muted-foreground">Course Code</Label>
                    <Input id={`courseCode-${originalIndex}`} name="courseCode" value={formData.courseCode || ''}
                           onChange={handleChange} required className="h-8 text-sm"/>
                </div>
                <div className="grid gap-1.5">
                    <Label htmlFor={`courseName-${originalIndex}`}
                           className="text-xs font-medium text-muted-foreground">Course Name</Label>
                    <Input id={`courseName-${originalIndex}`} name="courseName" value={formData.courseName || ''}
                           onChange={handleChange} className="h-8 text-sm"/>
                </div>
                <div className="grid gap-1.5">
                    <Label htmlFor={`sectionDetails-${originalIndex}`}
                           className="text-xs font-medium text-muted-foreground">Section</Label>
                    <Input id={`sectionDetails-${originalIndex}`} name="sectionDetails"
                           value={formData.sectionDetails || ''} onChange={handleChange} className="h-8 text-sm"/>
                </div>


                <div className="grid grid-cols-2 gap-3">
                    <div className="grid gap-1.5">
                        <Label htmlFor={`startTime-${originalIndex}`}
                               className="text-xs font-medium text-muted-foreground">Start Time</Label>

                        <TimeSelect
                            value={formData.startTime}
                            onChange={(value) => handleTimeChange('startTime', value)}
                        />
                    </div>
                    <div className="grid gap-1.5">
                        <Label htmlFor={`endTime-${originalIndex}`}
                               className="text-xs font-medium text-muted-foreground">End Time</Label>

                        <TimeSelect
                            value={formData.endTime}
                            onChange={(value) => handleTimeChange('endTime', value)}
                        />
                    </div>
                </div>


                <div className="grid gap-1.5">
                    <Label className="text-xs font-medium text-muted-foreground mb-1">Days</Label>
                    <ToggleGroup
                        type="multiple"
                        value={selectedDays}
                        onValueChange={handleDaysToggleChange}
                        className="flex justify-start gap-2"
                    >
                        {ALL_DAYS.map(day => (
                            <ToggleGroupItem
                                key={day}
                                value={day}
                                aria-label={`Toggle ${day}`}

                                className={cn(
                                    "h-12 w-12 p-0 flex items-center justify-center rounded-md",
                                    "border-2",
                                    "border-input",
                                    "hover:bg-accent hover:text-accent-foreground",
                                    "data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:border-primary"
                                )}
                            >
                                <span className="text-lg font-medium">
                                    {DAY_INITIALS[day]}
                                </span>
                            </ToggleGroupItem>
                        ))}
                    </ToggleGroup>
                </div>


                <div className="grid gap-1.5">
                    <Label htmlFor={`location-${originalIndex}`}
                           className="text-xs font-medium text-muted-foreground">Location</Label>
                    <Input id={`location-${originalIndex}`} name="location" value={formData.location || ''}
                           onChange={handleChange} className="h-8 text-sm"/>
                </div>
            </div>


            <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
                <Button type="submit" size="sm">Save Changes</Button>
            </div>
        </form>
    );
};


const ScheduleGrid: React.FC<ScheduleGridProps> = ({scheduleData, onUpdateEvent}) => {
    const {scheduleEvents} = scheduleData;

    const [courseColors, setCourseColors] = useState<Map<string, ColorPair>>(new Map());

    useEffect(() => {
        setCourseColors(prevMap => {
            const currentBaseCodes = new Set<string>();
            scheduleEvents.forEach(event => {
                if (event.courseCode) {
                    const baseCode = getBaseCourseCode(event.courseCode);
                    if (baseCode) currentBaseCodes.add(baseCode);
                }
            });

            let updated = false;
            const newMap = new Map(prevMap);
            let nextColorIndex = newMap.size;

            currentBaseCodes.forEach(baseCode => {
                if (!newMap.has(baseCode)) {
                    const color = colorPairs[nextColorIndex % colorPairs.length];
                    newMap.set(baseCode, color);
                    nextColorIndex++;
                    updated = true;
                }
            });

            if (updated) {
                return newMap;
            }

            return prevMap;
        });

    }, [scheduleEvents]);


    const {minTime, maxTime} = useMemo(() => {
        let earliest = 24 * 60, latest = 0;
        scheduleEvents.forEach(event => {
            const start = event.startTime ? parseTimeToMinutes(event.startTime) : NaN;
            const end = event.endTime ? parseTimeToMinutes(event.endTime) : NaN;
            if (!isNaN(start)) earliest = Math.min(earliest, start);
            if (!isNaN(end)) latest = Math.max(latest, end);
        });

        if (earliest >= latest || earliest === 24 * 60) {
            earliest = 7 * 60;
            latest = 18 * 60;
        }
        const gridStartHour = Math.floor(Math.max(0, earliest - 30) / 60);
        const gridEndHour = Math.ceil(Math.min(24 * 60, latest + 30) / 60);


        return {minTime: gridStartHour * 60, maxTime: gridEndHour * 60};
    }, [scheduleEvents]);


    const eventsByDay = useMemo(() => {
        const grouped: { [key: number]: (ScheduleEvent & { originalIndex: number })[] } = {
            0: [], 1: [], 2: [], 3: [], 4: []
        };
        scheduleEvents.forEach((event, index) => {
            if (!event.days || event.days.length === 0) return;
            const dayIndices = event.days.map(getDayIndex).filter(idx => idx >= 0 && idx <= 4);
            dayIndices.forEach(dayIndex => {
                grouped[dayIndex].push({...event, originalIndex: index});
            });
        });
        return grouped;
    }, [scheduleEvents]);


    const [openPopoverKey, setOpenPopoverKey] = useState<string | null>(null);


    const timeInterval = 60;
    const totalMinutes = maxTime - minTime;


    if (totalMinutes <= 0 || isNaN(totalMinutes)) {
        console.error("Invalid time range calculated:", {minTime, maxTime, totalMinutes});
        return <Card className="p-4 text-center text-destructive-foreground bg-destructive/80">Could not determine a
            valid time range for the schedule.</Card>;
    }


    const totalHours = Math.ceil(totalMinutes / timeInterval);
    const gridHeightRem = totalHours * 3;

    const fallbackColor = colorPairs[0];

    return (
        <Card className="p-4 overflow-hidden bg-card">

            <div className="grid grid-cols-[auto_repeat(5,1fr)] gap-x-2 relative" role="grid">
                <div className="sticky top-0 z-20 bg-card pb-2"></div>
                {SHORT_DAYS.map(day => (
                    <div key={day}
                         className="sticky top-0 z-20 bg-card text-center font-semibold text-sm text-muted-foreground pb-2 border-b border-border/50">
                        {day}
                    </div>
                ))}


                <div className="row-start-2 flex flex-col border-r border-border/50 pr-2">
                    {Array.from({length: totalHours}).map((_, hourIndex) => {
                        const hourTime = minTime + hourIndex * timeInterval;
                        const displayTime = formatMinutesToTime(hourTime);
                        return (
                            <div key={`label_${hourTime}`} className="text-right text-xs text-muted-foreground pt-0.5"
                                 style={{height: '3rem'}}>
                                {displayTime}
                            </div>
                        );
                    })}
                </div>


                <div className="row-start-2 col-start-2 col-span-5 grid grid-cols-5 gap-x-2 relative">
                    <div
                        className="absolute inset-0 grid grid-rows-[repeat(var(--total-hours),3rem)] pointer-events-none z-0"
                        aria-hidden="true">
                        {Array.from({length: totalHours + 1}).map((_, i) => (
                            <div key={`hline-${i}`} className="border-t border-dashed border-border/30"></div>
                        ))}
                    </div>
                    <style>{`:root { --total-hours: ${totalHours}; }`}</style>


                    {SHORT_DAYS.map((_, dayIndex) => (

                        <div
                            key={`day-col-${dayIndex}`}
                            className="relative border-r border-dashed border-border/30 last:border-r-0"
                            style={{height: `${gridHeightRem}rem`}}
                        >

                            <motion.div
                                className="relative w-full h-full"
                                variants={containerVariants}
                                initial="hidden"
                                animate="visible"
                            >

                                {eventsByDay[dayIndex]?.map((eventWithIndex) => {
                                    const {originalIndex, ...event} = eventWithIndex;

                                    if (!event.startTime || !event.endTime) return null;
                                    const startMinutes = parseTimeToMinutes(event.startTime);
                                    const endMinutes = parseTimeToMinutes(event.endTime);

                                    if (isNaN(startMinutes) || isNaN(endMinutes) || startMinutes >= endMinutes) return null;
                                    const duration = endMinutes - startMinutes;
                                    if (duration <= 0) return null;

                                    const topOffset = totalMinutes > 0 ? ((startMinutes - minTime) / totalMinutes) * 100 : 0;
                                    const height = totalMinutes > 0 ? (duration / totalMinutes) * 100 : 0;

                                    if (isNaN(topOffset) || isNaN(height) || height <= 0) return null;
                                    const baseCode = getBaseCourseCode(event.courseCode);
                                    const courseColor = courseColors.get(baseCode) || fallbackColor;
                                    const instanceKey = `${originalIndex}-day-${dayIndex}`;

                                    return (
                                        <Popover key={instanceKey} open={openPopoverKey === instanceKey}
                                                 onOpenChange={(isOpen) => {
                                                     if (isOpen) {
                                                         setOpenPopoverKey(instanceKey);
                                                     } else if (openPopoverKey === instanceKey) {
                                                         setOpenPopoverKey(null);
                                                     }
                                                 }}>
                                            <PopoverTrigger asChild>
                                                <motion.div
                                                    variants={itemVariants}
                                                    className={cn(
                                                        "absolute rounded-md shadow-sm border overflow-hidden cursor-pointer group",
                                                        "flex flex-col justify-start",
                                                        "transition-colors duration-150 z-10",
                                                        courseColor?.bg, courseColor?.text, courseColor?.border,
                                                        "pointer-events-auto",
                                                        "p-1 md:p-1.5"
                                                    )}
                                                    style={{
                                                        top: `${topOffset}%`, height: `${height}%`,
                                                        left: '2px', right: '2px',
                                                    }}
                                                    title={`Edit: ${event.courseCode || 'Event'}...`}
                                                    whileHover={{scale: 1.03, zIndex: 20}}

                                                    layout
                                                    transition={{

                                                        type: "spring",
                                                        stiffness: 400,
                                                        damping: 20,
                                                    }}
                                                >


                                                    <p className="text-[10px] md:text-[11px] font-bold md:font-semibold leading-tight">
                                                        {event.courseCode || 'Event'}{event.sectionDetails ? ` (${event.sectionDetails})` : ''}
                                                    </p>


                                                    <div className="hidden md:block text-[9px] leading-tight mt-0.5">
                                                        <p>{event.startTime} - {event.endTime}</p>

                                                        {event.location && (
                                                            <p className="font-semibold truncate mt-auto pt-0.5">{event.location}</p>
                                                        )}
                                                    </div>


                                                    <Edit3
                                                        className="absolute bottom-1 right-1 h-3 w-3 text-inherit opacity-0 group-hover:opacity-60 transition-opacity pointer-events-none hidden md:block"/>


                                                </motion.div>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-80 z-50 p-4">

                                                <EventEditForm
                                                    event={scheduleEvents[originalIndex]}
                                                    originalIndex={originalIndex}
                                                    onSave={onUpdateEvent}
                                                    onClose={() => setOpenPopoverKey(null)}
                                                />
                                            </PopoverContent>
                                        </Popover>
                                    );
                                })}
                            </motion.div>
                        </div>
                    ))}
                </div>
            </div>
        </Card>
    );
};

export default ScheduleGrid;