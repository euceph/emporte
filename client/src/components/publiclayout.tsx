import React, {useState, useEffect} from 'react';
import {Outlet, Navigate} from 'react-router';
import {Loader2} from 'lucide-react';

const PublicLayout: React.FC = () => {
    const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

    useEffect(() => {
        let isMounted = true;

        const checkAuth = async () => {
            // console.log("PublicLayout: Checking authentication via /api/me...");
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
                    // console.log("PublicLayout: Check complete. Status: Authenticated");
                } else {
                    setIsAuthenticated(false);
                    // console.log(`PublicLayout: Auth check failed or user not logged in. Status: ${response.status}`);
                }

            } catch (error) {
                if (!isMounted) return;
                console.error("PublicLayout: Error during auth check:", error);
                setIsAuthenticated(false);
                // console.log("PublicLayout: Check complete due to error. Status: Not Authenticated");
            }
        };

        checkAuth();

        return () => {
            isMounted = false;
            // console.log("PublicLayout: Unmounted");
        };
    }, []);

    if (isAuthenticated === null) {

        return (
            <div className="flex justify-center items-center min-h-screen">
                <Loader2 className="h-8 w-8 animate-spin text-primary"/>
            </div>
        );
    }


    if (isAuthenticated) {

        // console.log("PublicLayout: User authenticated, redirecting to /import");
        return <Navigate to="/import" replace/>;
    }


    // console.log("PublicLayout: User not authenticated, rendering Outlet (public child route)");
    return <Outlet/>;
};

export default PublicLayout;