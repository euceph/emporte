import React from 'react';
import {motion} from 'framer-motion';
import {
    ArrowLeft, Ban, BrainCircuit, CheckCircle, Clock, FileImage, FileSymlink, Fingerprint, GanttChartSquare,
    Info, Lock, Mail, Share2, ShieldOff, ShieldQuestion, Trash2, UserCheck, Zap
} from 'lucide-react';
import {useNavigate} from 'react-router';
import {Button} from '@/components/ui/button';
import {Separator} from '@/components/ui/separator';
import {cn} from "@/lib/utils.ts";


const containerVariants = {
    hidden: {opacity: 0},
    show: {
        opacity: 1,
        transition: {
            staggerChildren: 0.08,
            delayChildren: 0.2,
        },
    },
};
const itemVariants = {
    hidden: {opacity: 0, y: 15},
    show: {opacity: 1, y: 0, transition: {duration: 0.4, ease: "easeOut"}},
};

interface ListItemProps {
    icon: React.ReactNode;
    children: React.ReactNode;
    className?: string;
}

const ListItem: React.FC<ListItemProps> = ({icon, children, className}) => (
    <li className={cn("flex items-start gap-3", className)}>
        <span className="text-primary mt-1 flex-shrink-0">{icon}</span>
        <div className="flex-grow text-muted-foreground">{children}</div>
    </li>
);


interface PolicySectionProps {
    title: string;
    children: React.ReactNode;
}

const PolicySection: React.FC<PolicySectionProps> = ({title, children}) => (
    <motion.section variants={itemVariants} className="mb-10 md:mb-12 last:mb-0">
        <h2 className="text-2xl md:text-3xl font-semibold text-foreground mb-5">{title}</h2>
        <div className="space-y-4">
            {children}
        </div>
        <Separator className="mt-8"/>
    </motion.section>
);


const PrivacyPolicy: React.FC = () => {
    const navigate = useNavigate();
    const appName = "emporte";
    const aiServiceProvider = "Gemini 2.0 Flash";
    const contactEmail = "help@emporte.app";
    const lastUpdatedDate = "April 22, 2025";

    return (
        <div className="min-h-screen bg-background text-foreground">
            <div className="container mx-auto px-4 py-10 md:py-16 max-w-3xl">

                <motion.div initial="hidden" animate="show" variants={itemVariants} className="mb-8">
                    <Button
                        variant="outline"
                        onClick={() => navigate('/')}
                        className="flex items-center gap-2"
                    >
                        <ArrowLeft className="h-4 w-4"/> Back
                    </Button>
                </motion.div>

                <motion.header
                    className="text-center mb-12 md:mb-16"
                    initial="hidden"
                    animate="show"
                    variants={containerVariants}
                >
                    <motion.h1 variants={itemVariants} className="text-4xl md:text-5xl lg:text-6xl font-bold mb-3">
                        Privacy at <span className="text-[var(--color-primary)]">em</span>porte
                    </motion.h1>
                    <motion.p variants={itemVariants} className="text-muted-foreground text-lg max-w-xl mx-auto">
                        A look into how we handle your data when you use our services.
                    </motion.p>
                    <motion.p variants={itemVariants} className="text-sm text-muted-foreground mt-2">
                        Last Updated: {lastUpdatedDate}
                    </motion.p>
                </motion.header>

                <motion.div
                    variants={itemVariants}
                    className="bg-muted/40 border border-border/30 rounded-lg p-6 md:p-8 mb-12 md:mb-16"
                >
                    <h2 className="text-2xl font-semibold text-foreground mb-5 text-center">Overview</h2>
                    <ul className="space-y-4 max-w-lg mx-auto">
                        <ListItem icon={<UserCheck size={20}/>}>
                            We use <strong>Google Sign-In</strong> for login. We request your basic profile info (name,
                            email, picture) as well as calendar access.
                        </ListItem>
                        <ListItem icon={<FileImage size={20}/>}>
                            You upload <strong>images of your schedule</strong>. We process them to extract event
                            details.
                        </ListItem>
                        <ListItem icon={<Zap size={20}/>}>
                            Images are sent to <strong>Google {aiServiceProvider}</strong> for analysis to extract your
                            schedule data.
                        </ListItem>
                        <ListItem icon={<GanttChartSquare size={20}/>}>
                            We use those event details and selected term dates to add events to <strong>your Google
                            Calendar</strong>, only when you confirm.
                        </ListItem>
                        <ListItem icon={<Trash2 size={20}/>}>
                            Uploaded images and temporary schedule data are <strong>deleted within 24 hours</strong>. We
                            intentionally don't store them long-term.
                        </ListItem>
                        <ListItem icon={<Share2 size={20}/>}>
                            We <strong>won't ever sell your data</strong>. Sharing is limited to core service functions
                            (Google, {aiServiceProvider}, infrastructure).
                        </ListItem>
                    </ul>
                </motion.div>

                <motion.div initial="hidden" animate="show" variants={containerVariants}>
                    <PolicySection title="What Data We Handle & Why">
                        <ul className="space-y-4">
                            <ListItem icon={<Fingerprint size={20}/>}>
                                <strong>Google Account Info (Name, Email, Picture):</strong> Collected via Google
                                Sign-In to securely log you in and identify you within the app (e.g., showing your name
                                in the header).
                            </ListItem>
                            <ListItem icon={<FileImage size={20}/>}>
                                <strong>Uploaded Schedule Images:</strong> You provide these. They are the core input
                                needed for the tool to work. Used solely for processing.
                            </ListItem>
                            <ListItem icon={<Zap size={20}/>}>
                                <strong>Image Content (Sent to AI):</strong> The visual information in your images is
                                sent to {aiServiceProvider} to analyze and extract potential schedule events (like
                                course codes, times, locations).
                            </ListItem>
                            <ListItem icon={<GanttChartSquare size={20}/>}>
                                <strong>Extracted Schedule Data (Temporary):</strong> The event details identified by
                                the AI (and potentially edited by you) are stored temporarily so you can review, edit,
                                and confirm them before they are sent to Google Calendar.
                            </ListItem>
                            <ListItem icon={<Clock size={20}/>}>
                                <strong>Term Dates & Timezone:</strong> You select term dates, and we detect your
                                timezone. This is essential for creating accurate, recurring events in your Google
                                Calendar.
                            </ListItem>
                        </ul>
                    </PolicySection>

                    <PolicySection title="Data Sharing (Who Sees What)">
                        <p className="text-muted-foreground mb-4">We keep data sharing minimal and only for essential
                            functions. We NEVER sell your data.</p>
                        <ul className="space-y-4">
                            <ListItem icon={<UserCheck size={20}/>}>
                                <strong>Google (Authentication & Calendar):</strong> For login (OAuth) and, only upon
                                your action, creating events in your Google Calendar (Calendar API). Governed by
                                Google's Privacy Policy.
                            </ListItem>
                            <ListItem icon={<Zap size={20}/>}>
                                <strong>{aiServiceProvider} (AI Analysis):</strong> Receives the content of your
                                uploaded images <strong>(no Google Workspace API data is sent)</strong> solely to
                                extract schedule information as described above. This transfer is not for training generalized AI/ML
                                models. Use is governed by Google's relevant terms and privacy policies.
                            </ListItem>
                            <ListItem icon={<Info size={20}/>}>
                                <strong>Infrastructure Providers (Hosting, Database):</strong> May process data as
                                needed to host the app and store temporary data (like Redis for sessions). They act on
                                our instructions.
                            </ListItem>
                        </ul>
                    </PolicySection>

                    <PolicySection title="Use of AI/ML Models and Google Workspace Data">
                        <ul className="space-y-4">
                            <ListItem icon={<Ban size={20}/>}>
                                <strong>No Training of Generalized AI/ML Models with Workspace Data:</strong> We
                                explicitly affirm that data obtained through Google Workspace APIs (such as your basic
                                profile information from Google Sign-In or data accessed via the Google Calendar API)
                                is <strong>not</strong> used by {appName} to develop, improve, or train generalized or
                                non-personalized Artificial Intelligence (AI) and/or Machine Learning (ML) models.
                            </ListItem>
                            <ListItem icon={<BrainCircuit size={20}/>}>
                                <strong>Use of Third-Party AI for Image Analysis:</strong> Our application
                                utilizes {aiServiceProvider}, a third-party AI service. We send the content of the
                                schedule images you upload to {aiServiceProvider} <strong>solely</strong> for the
                                purpose of analyzing these images and extracting potential schedule event details (like
                                course codes, times, locations). This is an essential part of the application's core
                                functionality.
                            </ListItem>
                            <ListItem icon={<FileSymlink size={20}/>}>
                                <strong>Data Sent to AI:</strong> The <strong>only</strong> data transferred
                                to {aiServiceProvider} is the content of the images you upload. We
                                do <strong>not</strong> send any data obtained from Google Workspace APIs (like your
                                profile info or existing calendar data) to {aiServiceProvider} or any other AI model for
                                analysis or training.
                            </ListItem>
                            <ListItem icon={<ShieldOff size={20}/>}>
                                <strong>No Training of Proprietary Models:</strong> {appName} does <strong>not</strong> use any of your data (neither
                                uploaded images nor data from Google Workspace APIs) to develop, train, or improve its
                                own proprietary AI/ML models. That's because we don't have any!
                            </ListItem>
                        </ul>
                    </PolicySection>

                    <PolicySection title="Data Retention & Deletion">
                        <ul className="space-y-4">
                            <ListItem icon={<Trash2 size={20}/>}>
                                <strong>Temporary Data (Images, Extracted Schedule):</strong> Deleted within 24 hours
                                after import, cancellation, timeout, or failure. We don't hoard this.
                            </ListItem>
                            <ListItem icon={<Clock size={20}/>}>
                                <strong>Google Account Link:</strong> Your basic profile info link remains active while
                                you use the app. You can remove {appName}'s access anytime in your Google Account
                                settings, which stops further access.
                            </ListItem>
                        </ul>
                    </PolicySection>

                    <PolicySection title="Security & Your Rights">
                        <ul className="space-y-4">
                            <ListItem icon={<Lock size={20}/>}>
                                <strong>Security Measures:</strong> We use standard practices like HTTPS (encryption in
                                transit), TLS, and secure Google authentication to protect your data. No system is 100%
                                secure, but we take reasonable steps.
                            </ListItem>
                            <ListItem icon={<ShieldQuestion size={20}/>}>
                                <strong>Your Control (Revoke Access):</strong> You control {appName}'s connection to
                                your Google Account. Revoke access anytime here: <a
                                href="https://myaccount.google.com/permissions" target="_blank"
                                rel="noopener noreferrer" className="text-primary hover:underline">Google Account
                                Permissions</a>. This stops us from accessing your calendar or profile info further.
                            </ListItem>
                            <ListItem icon={<CheckCircle size={20}/>}>
                                <strong>Your Data, Your Rights:</strong> Temporary data is auto-deleted (see Retention).
                                Revoking Google access handles linked data. For other questions or requests, contact us.
                            </ListItem>
                        </ul>
                    </PolicySection>

                    <PolicySection title="Other Important Stuff">
                        <ul className="space-y-4">
                            <ListItem icon={<Info size={20}/>}>
                                <strong>Policy Changes:</strong> We might update this policy. If we do, you'll know by
                                checking the "Last Updated" date above.
                            </ListItem>
                            <ListItem icon={<Mail size={20}/>}>
                                <strong>Questions?</strong> Contact us about privacy at <a
                                href={`mailto:${contactEmail}`}
                                className="text-primary hover:underline">{contactEmail}</a>.
                            </ListItem>
                        </ul>
                    </PolicySection>

                </motion.div>
            </div>
        </div>
    );
};

export default PrivacyPolicy;
