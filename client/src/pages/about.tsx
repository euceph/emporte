import React from 'react';
import {Link, useNavigate} from 'react-router';
import {motion} from 'framer-motion';
import {ArrowLeft, LogIn, UploadCloud, ScanEye, CalendarCheck, Trash2} from 'lucide-react';
import {Button} from '@/components/ui/button';


const containerVariants = {
    hidden: {opacity: 0},
    visible: {
        opacity: 1,
        transition: {staggerChildren: 0.15, delayChildren: 0.2}
    }
};

const itemVariants = {
    hidden: {opacity: 0, y: 20},
    visible: {opacity: 1, y: 0, transition: {duration: 0.5, ease: "easeOut"}}
};

const About: React.FC = () => {

    const navigate = useNavigate();


    const steps = [
        {
            icon: LogIn,
            title: "1. Sign In with Google",
            description: "We use your Google account for secure sign-in and to access your Google Calendar. We ask for permissions to create events."
        },
        {
            icon: UploadCloud,
            title: "2. Upload Your Schedule",
            description: "Take clear screenshots (PNG, JPG, or WEBP) of your course schedule and upload them. Our secure server receives the images."
        },
        {
            icon: ScanEye,
            title: "3. AI Processing & Preview",
            description: "Our system uses AI to analyze the screenshots and extract your schedule details (course codes, times, days, locations). You'll see a preview to verify or edit the information."
        },
        {
            icon: CalendarCheck,
            title: "4. Confirm & Import",
            description: "Set your term's start and end dates, confirm your timezone, and hit 'Confirm'. We'll create the recurring events directly in your Google Calendar."
        },
        {
            icon: Trash2,
            title: "5. Secure Data Deletion",
            description: "Once you confirm or cancel the import, your uploaded screenshots and the extracted schedule data are permanently deleted from our servers. We don't ever keep user data."
        }
    ];

    return (
        <div className="min-h-screen bg-background text-foreground p-4 md:p-8 flex flex-col items-center">
            <motion.div
                className="w-full max-w-4xl"
                initial="hidden"
                animate="visible"
                variants={containerVariants}
            >

                <motion.div variants={itemVariants} className="mb-8">

                    <Button
                        variant="outline"
                        onClick={() => navigate('/')}
                        className="flex items-center gap-2"
                        type="button"
                    >
                        <ArrowLeft className="h-4 w-4"/>
                        Back
                    </Button>
                </motion.div>


                <motion.div variants={itemVariants} className="text-center mb-12 md:mb-16">
                    <h1 className="text-4xl md:text-5xl font-extrabold mb-3">
                        How <span className="text-[var(--color-primary)]">em</span>porte Works
                    </h1>
                    <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                        Turning your schedule screenshot into calendar events in 5 simple steps.
                    </p>
                </motion.div>


                <motion.div
                    className="space-y-10 md:space-y-12"
                    variants={containerVariants}
                >
                    {steps.map((step, index) => (
                        <motion.div
                            key={index}
                            variants={itemVariants}
                            className="flex flex-col md:flex-row items-center gap-6 md:gap-8"
                        >
                            <div className="flex-shrink-0 bg-primary/10 text-primary rounded-full p-4 md:p-5">
                                <step.icon className="h-8 w-8 md:h-10 md:w-10"/>
                            </div>
                            <div className="text-center md:text-left">
                                <h2 className="text-xl md:text-2xl font-semibold mb-1">{step.title}</h2>
                                <p className="text-muted-foreground leading-relaxed">{step.description}</p>
                            </div>
                        </motion.div>
                    ))}
                </motion.div>


                <motion.div variants={itemVariants} className="text-center mt-16 text-sm text-muted-foreground">
                    Have more questions? Check out our <Link to="/privacy"
                                                             className="text-primary underline hover:text-primary/80">Privacy
                    Policy</Link>.
                </motion.div>
            </motion.div>
        </div>
    );
};

export default About;