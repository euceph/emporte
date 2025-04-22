import React, {useState, useRef, useCallback, useEffect} from 'react';
import {useNavigate} from 'react-router';
import {Button} from '@/components/ui/button';
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import {Skeleton} from '@/components/ui/skeleton';
import {Avatar, AvatarFallback, AvatarImage} from "@/components/ui/avatar";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {UploadCloud, File as FileIcon, X, Loader2, AlertCircle, User, LogOut} from 'lucide-react';
import {cn} from "@/lib/utils";
import {toast} from "sonner";

const MAX_FILES = 4;

interface UserInfo {
    name?: string;
    picture?: string;
    email?: string;
}

const Import: React.FC = () => {

    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
    const [isDragging, setIsDragging] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const navigate = useNavigate();


    const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
    const [isUserLoading, setIsUserLoading] = useState<boolean>(true);


    useEffect(() => {
        let isMounted = true;
        setIsUserLoading(true);

        const fetchUserInfo = async () => {
            // console.log("Import Page: Fetching user info...");
            try {
                const serverUrl = import.meta.env.VITE_SERVER_BASE_URL;
                if (!serverUrl) throw new Error("Server URL is not configured.");

                const response = await fetch(`${serverUrl}/api/me`, {
                    method: 'GET',
                    credentials: 'include',
                    headers: {'Accept': 'application/json'},
                });

                if (!isMounted) return;

                if (response.ok) {
                    const data = await response.json();

                    if (data.authenticated && data.user) {
                        // console.log("Import Page: User info fetched:", data.user);
                        setUserInfo(data.user);
                    } else {
                        console.warn("Import Page: /api/me responded OK but data structure unexpected:", data);
                        setUserInfo(null);
                    }
                } else {
                    console.warn(`Import Page: Failed to fetch user info, status: ${response.status}`);
                    setUserInfo(null);


                }
            } catch (error) {
                if (!isMounted) return;
                console.error("Import Page: Error fetching user info:", error);
                toast.error("Failed to load user data");
                setUserInfo(null);
            } finally {
                if (isMounted) {
                    setIsUserLoading(false);
                }
            }
        };

        fetchUserInfo();

        return () => {
            isMounted = false;
        };
    }, []);


    const addFiles = (newFiles: FileList | File[]) => {
        const filesToAdd = Array.from(newFiles);
        const acceptedTypes = ['image/png', 'image/jpeg', 'image/webp'];
        let invalidTypeCount = 0;

        const validFiles = filesToAdd.filter(file => {
            if (acceptedTypes.includes(file.type)) return true;
            invalidTypeCount++;
            return false;
        });

        const totalPotentialFiles = selectedFiles.length + validFiles.length;
        if (totalPotentialFiles > MAX_FILES) {
            toast.error("File Limit Exceeded", {
                description: `You can only upload a maximum of ${MAX_FILES} files. ${validFiles.length - (totalPotentialFiles - MAX_FILES)} files were added.`,
            });
        }

        const spaceAvailable = MAX_FILES - selectedFiles.length;
        const filesToActuallyAdd = validFiles.slice(0, spaceAvailable);

        if (filesToActuallyAdd.length > 0) {
            setSelectedFiles(prev => [...prev, ...filesToActuallyAdd]);
        }

        if (invalidTypeCount > 0) {
            toast.warning("Invalid File Type", {
                description: `${invalidTypeCount} file(s) ignored. Please upload PNG, JPG, or WEBP images.`,
            });
        }
        // console.log(`Added ${addedCount} valid files.`);
    };

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        if (event.target.files) addFiles(event.target.files);
        event.target.value = '';
    };

    const handleDropzoneClick = () => {
        if (selectedFiles.length >= MAX_FILES) {
            toast.info("File Limit Reached", {description: `You have already selected the maximum of ${MAX_FILES} files.`});
            return;
        }
        fileInputRef.current?.click();
    };

    const handleRemoveFile = (indexToRemove: number, event: React.MouseEvent) => {
        event.stopPropagation();
        setSelectedFiles(prev => prev.filter((_, index) => index !== indexToRemove));
    };

    const handleDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.stopPropagation();
        setIsDragging(true);
    }, []);

    const handleDragLeave = useCallback((event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.stopPropagation();
        if (event.currentTarget.contains(event.relatedTarget as Node)) return;
        setIsDragging(false);
    }, []);

    const handleDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.stopPropagation();
        setIsDragging(false);
        if (event.dataTransfer.files) addFiles(event.dataTransfer.files);
        event.dataTransfer.clearData();
    }, [selectedFiles]);


    const handleContinue = async () => {

        if (selectedFiles.length === 0) {
            toast.error("Missing Information", {
                description: `Please upload 1-${MAX_FILES} schedule screenshots.`,
            });
            return;
        }

        setIsLoading(true);
        const loadingToastId = toast.loading(`Uploading ${selectedFiles.length} schedule(s)...`);

        const formData = new FormData();
        selectedFiles.forEach((file) => {
            formData.append('files', file);
        });


        try {
            const serverUrl = import.meta.env.VITE_SERVER_BASE_URL;

            const response = await fetch(`${serverUrl}/api/upload`, {
                method: 'POST',
                body: formData,
                credentials: 'include',
            });
            const result = await response.json();

            if (!response.ok) {
                throw new Error(result?.message || `Upload failed: ${response.statusText}`);
            }

            toast.dismiss(loadingToastId);
            toast.success("Upload Successful!", {
                description: result?.message || `Processing ${selectedFiles.length} schedule(s). Ready for preview.`,
            });

            // console.log('Upload successful:', result);


            navigate('/preview');

        } catch (error: unknown) {
            toast.dismiss(loadingToastId);
            let errorMessage = "Could not upload files. Please try again.";
            if (error instanceof Error) errorMessage = error.message;
            toast.error("Upload Failed", {description: errorMessage});
            console.error("Upload failed:", error);
        } finally {
            setIsLoading(false);
        }
    };


    const canContinue = selectedFiles.length > 0 && !isLoading;


    const getInitials = (name?: string): string => {
        if (!name) return '?';
        const names = name.trim().split(' ');
        if (names.length === 0 || names[0] === '') return '?';

        const firstInitial = names[0][0]?.toUpperCase();

        const lastInitial = names.length > 1 ? names[names.length - 1][0]?.toUpperCase() : '';

        return `${firstInitial || ''}${lastInitial || ''}` || '?';
    };

    const serverUrl = import.meta.env.VITE_SERVER_BASE_URL;
    const logoutUrl = `${serverUrl}/auth/logout`;


    return (
        <div className="flex flex-col min-h-screen items-center justify-center bg-background p-4">

            <div className="w-full max-w-lg">


                <header className="w-full max-w-lg mb-6 flex justify-between items-center">

                    <div>
                        <h1 className="text-3xl sm:text-4xl font-extrabold text-balance">
                            <span className="text-[var(--color-primary)]">em</span>porte
                        </h1>
                    </div>


                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>


                            <div
                                className="flex items-center gap-2 cursor-pointer rounded-md p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background">
                                {isUserLoading ? (

                                    <>
                                        <Skeleton className="h-8 w-8 rounded-full"/>
                                        <Skeleton className="h-4 w-[100px]"/>
                                    </>

                                ) : userInfo ? (
                                    <>
                                        <Avatar className="h-8 w-8">
                                            <AvatarImage src={userInfo.picture} alt={userInfo.name || 'User Avatar'}/>
                                            <AvatarFallback className="text-xs font-semibold">
                                                {getInitials(userInfo.name)}
                                            </AvatarFallback>
                                        </Avatar>
                                        <span
                                            className="text-sm font-medium text-foreground truncate max-w-[150px] sm:max-w-xs">
                {userInfo.name || 'User'}
            </span>
                                    </>
                                ) : (
                                    <User className="h-6 w-6 text-muted-foreground"/>
                                )}
                            </div>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-24">

                            <DropdownMenuItem asChild className="cursor-pointer">


                                <a href={logoutUrl} className="w-full flex items-center">
                                    <LogOut className="mr-2 h-4 w-4 text-red-500"/>
                                    <span className="text-red-500">Log Out</span>
                                </a>
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </header>
                <Card className="w-full max-w-lg shadow-lg border border-border/40 rounded-xl">
                    <CardHeader className="text-center pb-4">
                        <CardTitle className="text-2xl font-bold tracking-tight text-foreground">Import Your
                            Schedule</CardTitle>

                        <CardDescription className="text-muted-foreground pt-1">
                            Upload up to {MAX_FILES} screenshots of your schedule.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-6 pt-4">

                        <div>
                            <label className="text-sm font-medium text-foreground mb-2 block text-center">
                                Schedule Screenshot(s)
                            </label>

                            <div
                                className={cn(
                                    "flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-6 text-center transition-colors duration-200 ease-in-out relative min-h-[150px]",
                                    "border-border/60 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/30 focus-within:ring-offset-2 focus-within:ring-offset-background",
                                    isDragging ? "border-primary bg-primary/10" : "bg-card hover:bg-muted/50",
                                    selectedFiles.length < MAX_FILES ? "cursor-pointer hover:border-primary/80" : "cursor-default",
                                    selectedFiles.length > 0 ? "border-primary/50" : ""
                                )}
                                onClick={selectedFiles.length < MAX_FILES ? handleDropzoneClick : undefined}
                                onDragOver={handleDragOver}
                                onDragLeave={handleDragLeave}
                                onDrop={handleDrop}
                                tabIndex={selectedFiles.length < MAX_FILES ? 0 : -1}
                                onKeyDown={(e) => {
                                    if ((e.key === 'Enter' || e.key === ' ') && selectedFiles.length < MAX_FILES) handleDropzoneClick();
                                }}
                                role={selectedFiles.length < MAX_FILES ? "button" : undefined}
                                aria-label="Upload schedule screenshots"
                            >
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    multiple
                                    className="hidden"
                                    onChange={handleFileChange}
                                    accept="image/png, image/jpeg, image/webp"
                                    aria-hidden="true"
                                />
                                {selectedFiles.length > 0 ? (
                                    <div className="flex flex-col items-center gap-2 w-full">
                                        <ul className="list-none p-0 m-0 w-full max-w-xs space-y-1.5">
                                            {selectedFiles.map((file, index) => (
                                                <li key={index}
                                                    className="flex items-center gap-2 p-1.5 rounded bg-muted text-sm shadow-sm">
                                                    <FileIcon className="h-4 w-4 text-primary flex-shrink-0"/>
                                                    <span
                                                        className="font-medium truncate flex-1 text-left pl-1">{file.name}</span>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-6 w-6 text-muted-foreground hover:text-destructive flex-shrink-0"
                                                        onClick={(e) => handleRemoveFile(index, e)}
                                                        aria-label={`Remove ${file.name}`}
                                                    >
                                                        <X className="h-4 w-4"/>
                                                    </Button>
                                                </li>
                                            ))}
                                        </ul>
                                        {selectedFiles.length < MAX_FILES && (
                                            <p className="text-xs text-muted-foreground mt-2">
                                                Click or drop zone to add more files ({selectedFiles.length}/{MAX_FILES})
                                            </p>
                                        )}
                                        {selectedFiles.length === MAX_FILES && (
                                            <p className="text-xs text-primary font-medium mt-2 flex items-center gap-1">
                                                <AlertCircle className="h-3 w-3"/> Maximum files selected.
                                            </p>
                                        )}
                                    </div>
                                ) : (
                                    <div
                                        className="flex flex-col items-center gap-2 text-muted-foreground pointer-events-none">
                                        <UploadCloud
                                            className={`h-10 w-10 transition-colors ${isDragging ? 'text-primary' : 'text-foreground/50'}`}/>
                                        <p className="font-semibold text-foreground">
                                            {isDragging ? 'Drop image(s) here' : 'Drag & drop screenshots'}
                                        </p>
                                        <p className="text-sm">or click to browse</p>
                                        <p className="text-xs mt-2">(Up to {MAX_FILES} files - PNG, JPG, WEBP)</p>
                                    </div>
                                )}
                            </div>
                        </div>


                    </CardContent>
                    <CardFooter className="pt-4">
                        <Button
                            variant="default"
                            className="w-full h-10 text-base font-semibold flex items-center justify-center gap-2"
                            onClick={handleContinue}
                            disabled={!canContinue}
                            aria-live="polite"
                        >
                            {isLoading ? (
                                <>
                                    <Loader2 className="h-5 w-5 animate-spin"/>
                                    Uploading...
                                </>
                            ) : (
                                'Preview'
                            )}
                        </Button>
                    </CardFooter>
                </Card>
            </div>
        </div>
    );
};

export default Import;