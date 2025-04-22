import React, {useState, useEffect, useRef} from 'react';
import {useNavigate} from 'react-router';
import {Button} from '@/components/ui/button';
import {Loader2, CalendarDays, Trash2} from 'lucide-react';
import {toast} from 'sonner';
import ScheduleGrid from "@/components/schedulegrid";
import {format as formatDate} from 'date-fns';
import {DateRangePicker} from '@/components/ui/date-range-picker';
import {Label} from '@/components/ui/label';
import {type DateRange} from 'react-day-picker';


export interface ScheduleEvent {
    courseCode: string;
    courseName: string | null;
    sectionDetails: string | null;
    days: string[];
    startTime: string | null;
    endTime: string | null;
    location: string | null;
}

export interface ScheduleData {
    termStartDate: string | null;
    termEndDate: string | null;
    scheduleEvents: ScheduleEvent[];

}


const parseDateString = (dateStr: string | null | undefined): Date | undefined => {
    if (!dateStr) return undefined;
    try {
        const date = new Date(`${dateStr}T00:00:00`);
        if (isNaN(date.getTime())) {
            console.warn(`Invalid date string encountered: ${dateStr}`);
            return undefined;
        }
        return date;
    } catch (e) {
        console.error(`Error parsing date string: ${dateStr}`, e);
        return undefined;
    }
};


const POLLING_INTERVAL_MS = 1500;
const POLLING_TIMEOUT_MS = 30000;

const Preview: React.FC = () => {

    const [scheduleData, setScheduleData] = useState<ScheduleData | null>(null);
    const [termDateRange, setTermDateRange] = useState<DateRange | undefined>(undefined);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [isConfirming, setIsConfirming] = useState<boolean>(false);
    const [isCancelling, setIsCancelling] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const navigate = useNavigate();


    const intervalRef = useRef<NodeJS.Timeout | null>(null);
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);


    useEffect(() => {
        const clearTimers = () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
                // console.log('Polling interval cleared.');
            }
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
                timeoutRef.current = null;
                // console.log('Polling timeout cleared.');
            }
        };

        const fetchPreviewData = async () => {
            // console.log('Polling for /api/preview data...');
            try {
                const serverUrl = import.meta.env.VITE_SERVER_BASE_URL;
                const response = await fetch(`${serverUrl}/api/preview`, { method: 'GET', credentials: 'include' });
                const result = await response.json().catch(() => ({}));

                if (response.ok) {
                    // console.log('Success: Data received from /api/preview');
                    if (!result || !result.scheduleData || !Array.isArray(result.scheduleData.scheduleEvents)) {
                        throw new Error("Received invalid schedule data format from server.");
                    }

                    setScheduleData(result.scheduleData);

                    const initialStartDate = parseDateString(result.scheduleData.termStartDate);
                    const initialEndDate = parseDateString(result.scheduleData.termEndDate);

                    let newRange: DateRange | undefined = undefined;
                    let needsDateToast = false;

                    if (initialStartDate && initialEndDate) {
                        if (initialEndDate >= initialStartDate) {
                            newRange = { from: initialStartDate, to: initialEndDate };
                        } else {
                            newRange = { from: initialStartDate, to: undefined };
                            needsDateToast = true;
                            console.warn("Term dates invalid: End date is before start date.");
                        }
                    } else if (initialStartDate) {
                        newRange = { from: initialStartDate, to: undefined };
                        needsDateToast = true;
                    } else {
                        newRange = undefined;
                        needsDateToast = true;
                    }

                    setTermDateRange(newRange);

                    if (needsDateToast) {
                        toast.info("Term Dates Need Selection", {
                            description: "AI couldn't fully determine the term dates. Please select the start and end dates manually."
                        });
                    }

                    setIsLoading(false);
                    setError(null);
                    clearTimers();
                    toast.success("Schedule preview ready!");
                    return;
                }
                if (response.status === 404) {
                    // console.log('Data not ready yet (404), continuing poll...');
                    if (!isLoading) setIsLoading(true);
                } else if (response.status === 401) {
                    // console.log('API returned 401 Unauthorized');
                    toast.error("Unauthorized", {description: "Your session expired. Please log in again."});
                    clearTimers();
                    navigate('/login');
                    setIsLoading(false);
                } else {
                    console.error(`API Error: Status ${response.status}`);
                    const errorMsg = result.message || result.error || `Failed to fetch preview data (Status: ${response.status}).`;
                    setError(errorMsg);
                    setIsLoading(false);
                    clearTimers();
                    toast.error("Error fetching preview", {description: errorMsg});
                }
            } catch (networkError: unknown) {
                console.error("Network error fetching preview data:", networkError);
                let errorMessage = "Network error. Please check your connection.";
                if (networkError instanceof Error) errorMessage = networkError.message;
                setError(errorMessage);
                setIsLoading(false);
                clearTimers();
                toast.error("Network Error", {description: errorMessage});
            }
        };

        setIsLoading(true);
        setError(null);
        setScheduleData(null);
        setTermDateRange(undefined);
        fetchPreviewData();


        if (isLoading && !intervalRef.current && !timeoutRef.current) {
            intervalRef.current = setInterval(fetchPreviewData, POLLING_INTERVAL_MS);
            timeoutRef.current = setTimeout(() => {
                console.warn(`Polling timed out after ${POLLING_TIMEOUT_MS / 1000}s.`);
                if (isLoading) {
                    setError('Processing is taking longer than expected. Please try again.');
                    setIsLoading(false);
                    toast.error("Processing Timed Out", {duration: 6000});
                    clearTimers();
                }
            }, POLLING_TIMEOUT_MS);
        }

        return () => {
            // console.log('PreviewPage cleanup: Clearing timers.');
            clearTimers();
        };
    }, [navigate]);


    const handleUpdateEvent = (index: number, updatedEventData: ScheduleEvent) => {
        setScheduleData(currentData => {
            if (!currentData) return null;
            const newEvents = currentData.scheduleEvents.map((event, i) => i === index ? updatedEventData : event);
            return {...currentData, scheduleEvents: newEvents};
        });
        toast.info("Event Updated", {description: "Changes staged. Confirm to save to calendar."});
    };


    const handleConfirmImport = async () => {
        const startDate = termDateRange?.from;
        const endDate = termDateRange?.to;
        const formattedStartDate = startDate ? formatDate(startDate, 'yyyy-MM-dd') : null;
        const formattedEndDate = endDate ? formatDate(endDate, 'yyyy-MM-dd') : null;

        if (!scheduleData) {
            toast.error("Error", {description: "No schedule data available."});
            return;
        }
        if (!formattedStartDate || !formattedEndDate) {
            toast.error("Missing Information", {description: "Term dates must be selected."});
            return;
        }
        if (startDate && endDate && endDate < startDate) {
            toast.error("Invalid Dates", {description: "Term end date before start date."});
            return;
        }


        const validEvents = scheduleData.scheduleEvents.filter(event => {
            const hasStartTime = event.startTime && typeof event.startTime === 'string';
            const hasEndTime = event.endTime && typeof event.endTime === 'string';
            const hasDays = Array.isArray(event.days) && event.days.length > 0;
            const timeRegex = /\d{1,2}:\d{2}\s*(AM|PM)/i;
            const validStartTimeFormat = hasStartTime && timeRegex.test(event.startTime!);
            const validEndTimeFormat = hasEndTime && timeRegex.test(event.endTime!);
            return hasDays && validStartTimeFormat && validEndTimeFormat;
        });

        const initialEventCount = scheduleData.scheduleEvents.length;
        if (validEvents.length === 0) {
            const msg = initialEventCount > 0 ? "None of the events have valid days/times." : "There are no events to import.";
            toast.error(initialEventCount > 0 ? "No Valid Events" : "No Events", {description: msg});
            return;
        }


        let userTimeZone: string | undefined = undefined;
        try {
            userTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
            if (!userTimeZone) {
                throw new Error("Browser did not provide a timezone.");
            }
            // console.log("User timezone detected:", userTimeZone);
        } catch (tzError: unknown) {

            let errorMessage = "Could not detect browser timezone.";
            if (tzError instanceof Error) {
                console.error("Could not get user timezone:", tzError.message);
                errorMessage = tzError.message;
            } else {

                console.error("Could not get user timezone (unknown error type):", tzError);
            }
            toast.error("Timezone Error", {description: `${errorMessage} Cannot create calendar events accurately.`});
            return;
        }


        const payloadToSend = {
            termStartDate: formattedStartDate,
            termEndDate: formattedEndDate,
            scheduleEvents: validEvents,
            userTimeZone: userTimeZone
        };


        setIsConfirming(true);
        const loadingToastId = toast.loading("Adding events to Google Calendar...");

        try {
            const serverUrl = import.meta.env.VITE_SERVER_BASE_URL;
            const response = await fetch(`${serverUrl}/api/calendar/create`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(payloadToSend),
                credentials: 'include',
            });
            const result = await response.json();
            toast.dismiss(loadingToastId);

            if (!response.ok) {
                throw new Error(result.message || `Failed: ${response.statusText}`);
            }


            const eventsFilteredCount = initialEventCount - validEvents.length;
            const baseMessage = result.message || `Created ${result.details?.created || validEvents.length} event series.`;
            let finalDescription = baseMessage;

            if (result.success === false) {
                toast.warning("Partial Success", {description: baseMessage, duration: 8000});
                navigate('/success', {
                    state: {
                        message: baseMessage,
                        details: result.details,
                        ignoredCount: eventsFilteredCount
                    }
                });
            } else {
                if (eventsFilteredCount > 0) {
                    const ignoredMsg = ` (${eventsFilteredCount} invalid event${eventsFilteredCount > 1 ? 's' : ''} ignored).`;
                    finalDescription = baseMessage + ignoredMsg;
                    toast.success("Import Successful (with notices)", {description: finalDescription, duration: 6000});
                } else {
                    toast.success("Import Successful!", {description: finalDescription, duration: 5000});
                }
                navigate('/success', {
                    state: {
                        message: finalDescription,
                        details: result.details,
                        ignoredCount: eventsFilteredCount
                    }
                });
            }
        } catch (error: unknown) {
            toast.dismiss(loadingToastId);
            let errorMessage = "Could not add events to calendar.";
            if (error instanceof Error) errorMessage = error.message;
            toast.error("Import Failed", {description: errorMessage});
            console.error("Calendar creation API call failed:", error);
        } finally {
            setIsConfirming(false);
        }
    };


    const handleCancelImport = async () => {
        setIsCancelling(true);
        const loadingToastId = toast.loading("Cancelling import...");
        try {
            const serverUrl = import.meta.env.VITE_SERVER_BASE_URL;
            const response = await fetch(`${serverUrl}/api/preview/delete`, {method: 'DELETE', credentials: 'include'});
            toast.dismiss(loadingToastId);
            if (response.ok) {
                toast.success("Import Cancelled");
                navigate('/import');
            } else {
                const result = await response.json().catch(() => ({}));
                throw new Error(result.message || `Failed to cancel: ${response.statusText}`);
            }
        } catch (error: unknown) {
            toast.dismiss(loadingToastId);
            let errorMessage = "Could not cancel import.";
            if (error instanceof Error) errorMessage = error.message;
            toast.error("Cancellation Failed", {description: errorMessage});
            console.error("Cancel import API call failed:", error);
        } finally {
            setIsCancelling(false);
        }
    };


    const renderContent = () => {
        if (isLoading) {
            return (
                <div className="flex flex-col justify-center items-center h-80">
                    <Loader2 className="h-8 w-8 animate-spin text-primary"/>
                    <span className="ml-2 text-muted-foreground mt-2">Processing schedule...</span>
                </div>
            );
        }
        if (error) {
            return (
                <div
                    className="flex flex-col justify-center items-center h-80 text-destructive bg-destructive/10 border border-destructive/30 rounded-lg p-4">
                    <p className="text-lg font-semibold">Error Loading Preview</p>
                    <p className="mt-1 text-sm text-center">{error}</p>
                    <Button variant="outline" size="sm" onClick={() => window.location.reload()} className="mt-4">
                        Try Again
                    </Button>
                </div>
            );
        }
        if (!scheduleData) {
            return <div className="text-center h-80 flex items-center justify-center text-muted-foreground">No schedule
                data available.</div>;
        }
        return (
            <div className="bg-muted/20 rounded-lg mb-6 overflow-x-auto border border-border/20">
                <ScheduleGrid scheduleData={scheduleData} onUpdateEvent={handleUpdateEvent}/>
            </div>
        );
    };


    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-background text-foreground p-4">
            <div className="w-full max-w-5xl p-6 bg-card border border-border/40 rounded-xl shadow-lg flex flex-col">
                <h1 className="text-2xl font-bold mb-2 text-center">Preview Your Schedule</h1>
                <p className="text-muted-foreground text-center mb-4">Verify or edit details below. Click an event to
                    modify it.</p>


                <div
                    className="flex flex-col sm:flex-row gap-2 sm:gap-4 justify-center items-center mb-6 p-4 border bg-muted/30 rounded-lg">
                    <div className='flex items-center gap-2 flex-shrink-0'>
                        <CalendarDays className="h-5 w-5 text-muted-foreground"/>
                        <Label className='font-medium text-sm whitespace-nowrap'>Term Dates:</Label>
                    </div>
                    <DateRangePicker
                        range={termDateRange}
                        setRange={setTermDateRange}
                        placeholder="Select Term Start & End Dates"
                        disabled={isLoading || isConfirming || isCancelling}
                    />
                </div>


                <div className="flex-grow mb-6">
                    {renderContent()}
                </div>


                {!isLoading && !error && (
                    <div className="flex flex-col sm:flex-row justify-end gap-3 mt-auto border-t border-border/40 pt-4">
                        <Button
                            variant="default"
                            onClick={handleConfirmImport}
                            disabled={isConfirming || isCancelling || !scheduleData || !termDateRange?.from || !termDateRange?.to}
                            className="min-w-[200px]"
                        >
                            {isConfirming ? (<><Loader2
                                className="h-4 w-4 animate-spin"/>Confirming...</>) : 'Confirm and Add to Calendar'}
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={handleCancelImport}
                            disabled={isConfirming || isCancelling}
                        >
                            {isCancelling ? (<><Loader2 className="h-4 w-4 animate-spin"/>Cancelling...</>) : (<><Trash2
                                className="h-4 w-4"/>Cancel Import</>)}
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
}

export default Preview;