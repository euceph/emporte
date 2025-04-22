import React, {useEffect, useState} from 'react'
import {motion} from 'framer-motion'
import {Button} from '@/components/ui/button'
import {Link} from "react-router";

const Homepage: React.FC = () => {
    const [isBlockedAgent, setIsBlockedAgent] = useState(false);

    useEffect(() => {
        const userAgent = navigator.userAgent;
        if (userAgent.includes('[LinkedInApp]')) {
            setIsBlockedAgent(true);
        }
    }, []);

    return (
        <div
            className="flex flex-col items-center justify-center min-h-screen px-4 bg-[var(--color-background)] text-[var(--color-text)]">
            <motion.div
                className="max-w-md w-full"
                initial={{opacity: 0, y: -20}}
                animate={{opacity: 1, y: 0}}
                transition={{duration: 0.5}}
            >
                <motion.div
                    className="mb-4 text-center"
                    initial={{scale: 0.8}}
                    animate={{scale: 1}}
                    transition={{delay: 0.2, duration: 0.5}}
                >
                    <h1 className="text-4xl font-extrabold mb-2 text-balance">
                        <span className="text-[var(--color-primary)]">em</span>porte
                    </h1>
                    <p className="text-lg font-bold text-[var(--color-primary-dark)]">Schedule to Calendar,
                        simplified.</p>
                </motion.div>

                <motion.div
                    className="mb-4 p-2 rounded-lg bg-[color-mix(in_oklch,var(--color-background),transparent_50%)] backdrop-blur-sm"
                    initial={{opacity: 0}}
                    animate={{opacity: 1}}
                    transition={{delay: 0.4, duration: 0.5}}
                >
                    <p className="mb-4">
                        Import your courses to Google Calendar with a screenshot.
                    </p>

                    <motion.div
                        initial={{opacity: 0, x: -10}}
                        animate={{opacity: 1, x: 0}}
                        transition={{delay: 0.6, duration: 0.3}}
                        className="flex items-center space-x-2 text-sm"
                    >
                        <span className="inline-block w-2 h-2 rounded-full bg-[var(--color-primary)]"></span>
                        <span>Quick and easy setup</span>
                    </motion.div>

                    <motion.div
                        initial={{opacity: 0, x: -10}}
                        animate={{opacity: 1, x: 0}}
                        transition={{delay: 0.7, duration: 0.3}}
                        className="flex items-center space-x-2 text-sm mt-2"
                    >
                        <span className="inline-block w-2 h-2 rounded-full bg-[var(--color-primary)]"></span>
                        <span>AI-powered recognition</span>
                    </motion.div>

                    <motion.div
                        initial={{opacity: 0, x: -10}}
                        animate={{opacity: 1, x: 0}}
                        transition={{delay: 0.8, duration: 0.3}}
                        className="flex items-center space-x-2 text-sm mt-2"
                    >
                        <span className="inline-block w-2 h-2 rounded-full bg-[var(--color-primary)]"></span>
                        <span>Your data is deleted after import</span>
                    </motion.div>
                </motion.div>

                <motion.div
                    className="text-center"
                    initial={{opacity: 0, y: 20}}
                    animate={{opacity: 1, y: 0}}
                    transition={{delay: 0.9, duration: 0.5}}
                >
                    <Link
                        to="/login"
                        style={{ pointerEvents: isBlockedAgent ? 'none' : 'auto', cursor: isBlockedAgent ? 'not-allowed': 'pointer' }}
                        aria-disabled={isBlockedAgent}
                        tabIndex={isBlockedAgent ? -1 : undefined}
                        onClick={(e) => { if (isBlockedAgent) e.preventDefault(); }}
                    >
                        <Button variant="secondary" disabled={isBlockedAgent}>
                            <svg className="fill-secondary-foreground" viewBox="0 0 512 512"
                                 xmlns="http://www.w3.org/2000/svg" fillRule="evenodd" clipRule="evenodd"
                                 strokeLinejoin="round" strokeMiterlimit="2">
                                <path
                                    d="M32.582 370.734C15.127 336.291 5.12 297.425 5.12 256c0-41.426 10.007-80.291 27.462-114.735C74.705 57.484 161.047 0 261.12 0c69.12 0 126.836 25.367 171.287 66.793l-73.31 73.309c-26.763-25.135-60.276-38.168-97.977-38.168-66.56 0-123.113 44.917-143.36 105.426-5.12 15.36-8.146 31.65-8.146 48.64 0 16.989 3.026 33.28 8.146 48.64l-.303.232h.303c20.247 60.51 76.8 105.426 143.36 105.426 34.443 0 63.534-9.31 86.341-24.67 27.23-18.152 45.382-45.148 51.433-77.032H261.12v-99.142h241.105c3.025 16.757 4.654 34.211 4.654 52.364 0 77.963-27.927 143.592-76.334 188.276-42.356 39.098-100.305 61.905-169.425 61.905-100.073 0-186.415-57.483-228.538-141.032v-.233z"/>
                            </svg>
                            Sign in with Google
                        </Button>
                    </Link>

                    {isBlockedAgent && (
                        <p className="mt-2 text-xs text-orange-600 dark:text-orange-400">
                            Sign-in isn't available in this browser. Please open the page in Safari or Chrome.
                        </p>
                    )}

                    <p className="mt-4 text-xs opacity-70">
                        We ask for calendar access — nothing else!
                    </p>
                </motion.div>
            </motion.div>

            <motion.footer
                className="absolute bottom-4 text-xs opacity-50"
                initial={{opacity: 0}}
                animate={{opacity: 1}}
                transition={{delay: 1.1, duration: 0.5}}
            >
                <p>© {new Date().getFullYear()} ·
                    <Link to="/about" className="underline hover:text-[var(--color-primary)] transition-colors px-1">
                        About
                    </Link>
                    {'·'}
                    <Link to="/privacy" className="underline hover:text-[var(--color-primary)] transition-colors px-1">
                        Privacy
                    </Link>
                </p>
            </motion.footer>
        </div>
    )
}

export default Homepage