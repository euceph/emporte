import React from 'react';
import {useLocation, Navigate, Link} from 'react-router';
import {Button} from '@/components/ui/button';
import {Check, AlertCircle} from 'lucide-react';

const Success: React.FC = () => {
    const location = useLocation();
    const navigateState = location.state as {
        message?: string;
        details?: {
            created?: number;
            errors?: { message: string; [key: string]: unknown }[];
        };
        ignoredCount?: number;
    } | null;

    if (!navigateState?.message) {
        console.warn("Success page accessed without valid state. Redirecting to /import.");
        return <Navigate to="/import" replace/>;
    }

    const createdCount = navigateState.details?.created ?? 0;
    const errorCount = navigateState.details?.errors?.length ?? 0;
    const ignoredCount = navigateState.ignoredCount ?? 0;

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-background text-foreground p-4">
            <div className="max-w-md w-full p-6 text-center bg-card border border-border/40 rounded-xl shadow-lg">
                <div
                    className={`w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center ${errorCount > 0 || ignoredCount > 0 ? 'bg-warning/20' : 'bg-primary/10'}`}>
                    {errorCount === 0 && ignoredCount === 0 ? (
                        <Check className="h-8 w-8 text-primary"/>
                    ) : (
                        <AlertCircle className="h-8 w-8 text-warning"/>
                    )}
                </div>

                <h1 className="text-2xl font-bold mb-2">
                    {errorCount === 0 && ignoredCount === 0 ? "Import Successful!" : "Import Complete (with notices)"}
                </h1>

                <p className="mb-4 text-muted-foreground">{navigateState.message}</p>

                {(errorCount > 0 || ignoredCount > 0) && (
                    <div className="text-sm text-left bg-muted/50 p-3 rounded-md mb-6 border border-border/30">
                        <p className="font-medium mb-1">Details:</p>
                        <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                            {createdCount > 0 && <li>{createdCount} event series added successfully.</li>}
                            {errorCount > 0 &&
                                <li className="text-destructive/90">{errorCount} event series failed to add.</li>}
                            {ignoredCount > 0 &&
                                <li className="text-amber-600 dark:text-amber-500">{ignoredCount} invalid event(s) were
                                    ignored before import.</li>}
                            {/* TODO: button to view specific errors from navigateState.details.errors */}
                        </ul>
                    </div>
                )}

                <p className="text-xs text-muted-foreground mb-6">
                    Any temporary data associated with this import has been scheduled for cleanup.
                </p>

                <div className="flex gap-4 justify-center">
                    <Button asChild variant="secondary">
                        <Link to="/import">Import Another</Link>
                    </Button>
                    <Button asChild variant="link">
                        <a href="https://calendar.google.com" target="_blank" rel="noopener noreferrer">
                            Go to Google Calendar
                        </a>
                    </Button>
                </div>
            </div>
        </div>
    );
}

export default Success;