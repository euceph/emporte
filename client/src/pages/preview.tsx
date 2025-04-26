import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { Loader2, CalendarDays, Trash2, AlertTriangle, FileWarning } from 'lucide-react';
import { toast } from 'sonner';
import ScheduleGrid from "@/components/schedulegrid";
import { format as formatDate } from 'date-fns';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { Label } from '@/components/ui/label';
import { type DateRange } from 'react-day-picker';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

import type { ScheduleData, ScheduleEvent, ProcessingWarning, ProcessingError, PreviewResult } from '@emporte/common';

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
    const [processingWarnings, setProcessingWarnings] = useState<ProcessingWarning[]>([]);
    const [processingErrors, setProcessingErrors] = useState<ProcessingError[]>([]);
    const [termDateRange, setTermDateRange] = useState<DateRange | undefined>(undefined);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [isConfirming, setIsConfirming] = useState<boolean>(false);
    const [isCancelling, setIsCancelling] = useState<boolean>(false);
    const [fetchError, setFetchError] = useState<string | null>(null);
    const navigate = useNavigate();

    const intervalRef = useRef<NodeJS.Timeout | null>(null);
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        const clearTimers = () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
            intervalRef.current = null;
            timeoutRef.current = null;
        };

        const fetchPreviewData = async () => {
            try {
                const serverUrl = import.meta.env.VITE_SERVER_BASE_URL;
                const response = await fetch(`${serverUrl}/api/preview`, { method: 'GET', credentials: 'include' });
                const result = await response.json().catch(() => ({}));

                if (response.ok) {
                    if (!result || !result.previewResult || !result.previewResult.scheduleData) {
                        throw new Error("Received invalid preview result format from server.");
                    }
                    const preview: PreviewResult = result.previewResult;

                    setScheduleData(preview.scheduleData);
                    setProcessingWarnings(preview.processingWarnings || []);
                    setProcessingErrors(preview.processingErrors || []);

                    const initialStartDate = parseDateString(preview.scheduleData.termStartDate);
                    const initialEndDate = parseDateString(preview.scheduleData.termEndDate);

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
                        if ((preview.processingWarnings || []).some(w => w.field?.startsWith('term')) || (!initialStartDate && !initialEndDate)) {
                            needsDateToast = true;
                        }
                    }
                    setTermDateRange(newRange);

                    if (needsDateToast) {
                        toast.info("Term Dates Need Selection", {
                            description: "AI couldn't fully determine the term dates. Please select the start and end dates manually.",
                            duration: 7000
                        });
                    }
                    if ((preview.processingWarnings || []).length > 0) {
                        toast.warning("Processing Warnings", {
                            description: "Some issues were found during processing. Please review the warnings below.",
                            duration: 6000
                        });
                    }
                    if ((preview.processingErrors || []).length > 0) {
                        toast.error("File Processing Errors", {
                            description: `${preview.processingErrors.length} file(s) could not be processed. See details below.`,
                            duration: 8000
                        });
                    }


                    setIsLoading(false);
                    setFetchError(null);
                    clearTimers();
                    toast.success("Schedule preview ready!");
                    return;
                }

                if (response.status === 404) {
                    if (!isLoading) setIsLoading(true);
                } else if (response.status === 401) {
                    toast.error("Unauthorized", { description: "Your session expired. Please log in again." });
                    clearTimers();
                    navigate('/login');
                    setIsLoading(false);
                } else {
                    const errorMsg = result.message || result.error || `Failed to fetch preview data (Status: ${response.status}).`;
                    setFetchError(errorMsg);
                    setIsLoading(false);
                    clearTimers();
                    toast.error("Error fetching preview", { description: errorMsg });
                }
            } catch (networkError: unknown) {
                let errorMessage = "Network error fetching preview. Please check your connection.";
                if (networkError instanceof Error) errorMessage = networkError.message;
                setFetchError(errorMessage);
                setIsLoading(false);
                clearTimers();
                toast.error("Network Error", { description: errorMessage });
            }
        };

        setIsLoading(true);
        setFetchError(null);
        setScheduleData(null);
        setProcessingWarnings([]);
        setProcessingErrors([]);
        setTermDateRange(undefined);

        fetchPreviewData();
        if (!intervalRef.current && !timeoutRef.current) {
            intervalRef.current = setInterval(fetchPreviewData, POLLING_INTERVAL_MS);
            timeoutRef.current = setTimeout(() => {
                if (isLoading) {
                    console.warn(`Polling timed out after ${POLLING_TIMEOUT_MS / 1000}s.`);
                    setFetchError('Processing is taking longer than expected. The server might be busy or an error occurred. Please try uploading again.');
                    setIsLoading(false);
                    toast.error("Processing Timed Out", { duration: 8000 });
                    clearTimers();
                }
            }, POLLING_TIMEOUT_MS);
        }


        return () => {
            clearTimers();
        };
    }, [navigate]);


    const handleUpdateEvent = (index: number, updatedEventData: ScheduleEvent) => {
        setScheduleData(currentData => {
            if (!currentData) return null;
            const newEvents = currentData.scheduleEvents.map((event, i) => i === index ? updatedEventData : event);
            return { ...currentData, scheduleEvents: newEvents };
        });
        toast.info("Event Updated", { description: "Changes staged. Confirm to save to calendar." });
    };


    const handleConfirmImport = async () => {
        const startDate = termDateRange?.from;
        const endDate = termDateRange?.to;
        const formattedStartDate = startDate ? formatDate(startDate, 'yyyy-MM-dd') : null;
        const formattedEndDate = endDate ? formatDate(endDate, 'yyyy-MM-dd') : null;

        if (!scheduleData) {
            toast.error("Error", { description: "No schedule data available." });
            return;
        }
        if (!formattedStartDate || !formattedEndDate) {
            toast.error("Missing Information", { description: "Valid term start and end dates must be selected." });
            return;
        }
        if (startDate && endDate && endDate < startDate) {
            toast.error("Invalid Dates", { description: "Term end date cannot be before start date." });
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
            const msg = initialEventCount > 0 ? "None of the events have valid days/times after filtering." : "There are no events to import.";
            toast.error(initialEventCount > 0 ? "No Valid Events" : "No Events", { description: msg });
            return;
        }


        let userTimeZone: string | undefined = undefined;
        try {
            userTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
            if (!userTimeZone) throw new Error("Browser did not provide a timezone.");
        } catch (tzError: unknown) {
            let errorMessage = "Could not detect browser timezone.";
            if (tzError instanceof Error) errorMessage = tzError.message;
            toast.error("Timezone Error", { description: `${errorMessage} Cannot create calendar events accurately.` });
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
                headers: { 'Content-Type': 'application/json' },
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

            navigate('/success', {
                state: {
                    message: baseMessage,
                    details: result.details,
                    ignoredCount: eventsFilteredCount,
                    warnings: processingWarnings,
                    errors: processingErrors,
                }
            });

        } catch (error: unknown) {
            toast.dismiss(loadingToastId);
            let errorMessage = "Could not add events to calendar.";
            if (error instanceof Error) errorMessage = error.message;
            toast.error("Import Failed", { description: errorMessage });
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
            const response = await fetch(`${serverUrl}/api/preview/delete`, { method: 'DELETE', credentials: 'include' });
            toast.dismiss(loadingToastId);
            if (!response.ok) {
                const result = await response.json().catch(() => ({}));
                throw new Error(result.message || `Failed to cancel: ${response.statusText}`);
            }
            toast.success("Import Cancelled");
            navigate('/import');
        } catch (error: unknown) {
            toast.dismiss(loadingToastId);
            let errorMessage = "Could not cancel import.";
            if (error instanceof Error) errorMessage = error.message;
            toast.error("Cancellation Failed", { description: errorMessage });
            console.error("Cancel import API call failed:", error);
        } finally {
            setIsCancelling(false);
        }
    };

    const renderWarnings = () => {
        if (processingWarnings.length === 0) return null;
        return (
            <Alert variant="default" className="mb-6 border-yellow-500/50 bg-yellow-500/10 text-yellow-800 dark:text-yellow-300">
                <FileWarning className="h-4 w-4 !text-yellow-600 dark:!text-yellow-400" />
                <AlertTitle className="font-semibold !text-yellow-700 dark:!text-yellow-300">Processing Warnings</AlertTitle>
                <AlertDescription className="text-sm space-y-1 mt-1">
                    {processingWarnings.map((warning, index) => (
                        <p key={index}>
                            {warning.filename && <span className="font-medium">[{warning.filename}]</span>} {warning.message}
                            {warning.field && <span className="text-xs opacity-80"> (Field: {warning.field})</span>}
                            {warning.value !== undefined && typeof warning.value !== 'object' && <span className="text-xs opacity-80"> (Value: "{String(warning.value).substring(0, 50)}")</span>}
                        </p>
                    ))}
                    <p className="mt-2 text-xs italic">Review schedule details/dates. Invalid info might be ignored or require manual input.</p>
                </AlertDescription>
            </Alert>
        );
    };

    const renderErrors = () => {
        if (processingErrors.length === 0) return null;
        return (
            <Alert variant="destructive" className="mb-6">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle className="font-semibold">File Processing Errors</AlertTitle>
                <AlertDescription className="text-sm space-y-1 mt-1">
                    {processingErrors.map((error, index) => (
                        <p key={index}>
                            <span className="font-medium">[{error.filename}]</span>: {error.error}
                        </p>
                    ))}
                    <p className="mt-2 text-xs italic">These files could not be processed. Their data is not included in the preview.</p>
                </AlertDescription>
            </Alert>
        );
    }

    const renderContent = () => {
        if (isLoading) {
            return (
                <div className="flex flex-col justify-center items-center h-80">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <span className="ml-2 text-muted-foreground mt-2">Processing schedule...</span>
                </div>
            );
        }
        if (fetchError) {
            return (
                <Alert variant="destructive" className="my-6">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Error Loading Preview</AlertTitle>
                    <AlertDescription>{fetchError}</AlertDescription>
                    <Button variant="outline" size="sm" onClick={() => window.location.reload()} className="mt-3">
                        Try Again
                    </Button>
                </Alert>
            );
        }
        if (!scheduleData) {
            return <div className="text-center h-80 flex items-center justify-center text-muted-foreground">No schedule data available to display.</div>;
        }

        return (
            <div className="bg-muted/20 rounded-lg mb-6 overflow-x-auto border border-border/20">
                <ScheduleGrid scheduleData={scheduleData} onUpdateEvent={handleUpdateEvent} />
            </div>
        );
    };


    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-background text-foreground p-4 pt-8 pb-8">
            <div className="w-full max-w-5xl p-6 bg-card border border-border/40 rounded-xl shadow-lg flex flex-col">
                <h1 className="text-2xl font-bold mb-2 text-center">Preview Your Schedule</h1>
                <p className="text-muted-foreground text-center mb-4">Verify or edit extracted details below. Click an event to modify it.</p>

                {}
                {renderErrors()}
                {renderWarnings()}

                {}
                <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 justify-center items-center mb-6 p-4 border bg-muted/30 rounded-lg">
                    <div className='flex items-center gap-2 flex-shrink-0'>
                        <CalendarDays className="h-5 w-5 text-muted-foreground" />
                        <Label htmlFor="term-date-picker" className='font-medium text-sm whitespace-nowrap'>Term Dates:</Label>
                    </div>
                    <DateRangePicker
                        id="term-date-picker"
                        range={termDateRange}
                        setRange={setTermDateRange}
                        placeholder="Select Term Start & End Dates"
                        disabled={isLoading || isConfirming || isCancelling}
                    />
                </div>

                {}
                <div className="flex-grow mb-6 min-h-[200px]"> {}
                    {renderContent()}
                </div>

                {}
                {!isLoading && !fetchError && scheduleData && (
                    <div className="flex flex-col sm:flex-row justify-end gap-3 mt-auto border-t border-border/40 pt-4">
                        <Button
                            variant="default"
                            onClick={handleConfirmImport}
                            disabled={isConfirming || isCancelling || !termDateRange?.from || !termDateRange?.to}
                            className="min-w-[200px]"
                            aria-label="Confirm and add events to Google Calendar"
                        >
                            {isConfirming ? (<><Loader2 className="h-4 w-4 animate-spin" />Confirming...</>) : 'Confirm & Add to Calendar'}
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={handleCancelImport}
                            disabled={isConfirming || isCancelling}
                            aria-label="Cancel import and return"
                        >
                            {isCancelling ? (<><Loader2 className="h-4 w-4 animate-spin" />Cancelling...</>) : (<><Trash2 className="h-4 w-4" />Cancel Import</>)}
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
}

export default Preview;