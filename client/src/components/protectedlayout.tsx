import React, {useState, useEffect} from 'react';
import {Outlet, Navigate} from 'react-router';
import {Loader2} from 'lucide-react';
import {toast} from 'sonner';

const ProtectedLayout: React.FC = () => {
    const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

    useEffect(() => {
        let isMounted = true;

        const checkAuth = async () => {
            // console.log("ProtectedLayout: Checking authentication via /api/me...");
            try {
                const serverUrl = import.meta.env.VITE_SERVER_BASE_URL;
                if (!serverUrl) {
                    throw new Error("Server URL is not configured.");
                }

                const response = await fetch(`${serverUrl}/api/me`, {
                    method: 'GET',
                    credentials: 'include',
                    headers: {
                        'Accept': 'application/json',
                    },
                });

                if (!isMounted) return;

                if (response.ok) {
                    setIsAuthenticated(true);
                    // console.log("ProtectedLayout: Check complete. Status: Authenticated");
                } else {
                    // console.log(`ProtectedLayout: Auth check failed with status ${response.status}`);
                    setIsAuthenticated(false);
                    // console.log("ProtectedLayout: Check complete. Status: Not Authenticated");
                }

            } catch (error) {
                if (!isMounted) return;
                console.error("ProtectedLayout: Error during auth check:", error);
                toast.error("Authentication Check Failed", {
                    description: "Could not verify your session. Please try logging in.",
                    duration: 5000
                });
                setIsAuthenticated(false);
                // console.log("ProtectedLayout: Check complete due to error. Status: Not Authenticated");
            }
        };

        checkAuth();

        return () => {
            isMounted = false;
            // console.log("ProtectedLayout: Unmounted");
        };
    }, []);

    if (isAuthenticated === null) {
        return (
            <div data-testid="loading-spinner" className="flex justify-center items-center min-h-screen">
                <Loader2 className="h-8 w-8 animate-spin text-primary"/>
            </div>
        );
    }

    if (!isAuthenticated) {
        // console.log("ProtectedLayout: Redirecting to /login");
        return <Navigate to="/login" replace/>;
    }

    // console.log("ProtectedLayout: Rendering Outlet (child route)");
    return <Outlet/>;
};

export default ProtectedLayout;