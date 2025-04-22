// src/components/ui/date-range-picker.tsx
import * as React from "react"
import { format } from "date-fns"
import { Calendar as CalendarIcon } from "lucide-react" // Renamed to avoid conflict
import { DateRange } from "react-day-picker"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar" // Your Shadcn Calendar import
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover"

// Define props for the component
interface DateRangePickerProps extends React.HTMLAttributes<HTMLDivElement> {
    range: DateRange | undefined;
    setRange: (range: DateRange | undefined) => void;
    placeholder?: string;
    disabled?: boolean;
}

export function DateRangePicker({
                                    className,
                                    range,        // Receive range state from parent
                                    setRange,     // Receive setter function from parent
                                    placeholder = "Select date range", // Default placeholder
                                    disabled = false, // Allow disabling
                                }: DateRangePickerProps) {

    return (
        <div className={cn("grid gap-2", className)}>
            <Popover>
                <PopoverTrigger asChild>
                    <Button
                        id="date"
                        variant={"outline"}
                        disabled={disabled} // Apply disabled state
                        className={cn(
                            "w-full sm:w-[280px] justify-start text-left font-normal", // Adjusted width, responsive
                            !range?.from && "text-muted-foreground" // Style placeholder state
                        )}
                    >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {range?.from ? (
                            range.to ? (
                                <>
                                    {format(range.from, "LLL dd, y")} -{" "}
                                    {format(range.to, "LLL dd, y")}
                                </>
                            ) : (
                                // Case where only 'from' date is selected
                                format(range.from, "LLL dd, y")
                            )
                        ) : (
                            // Placeholder text when no date is selected
                            <span>{placeholder}</span>
                        )}
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                        initialFocus
                        mode="range" // Set calendar mode to range selection
                        defaultMonth={range?.from} // Start view at the 'from' date if available
                        selected={range} // Pass the external range state here
                        onSelect={setRange} // Use the setter from props directly
                        numberOfMonths={2} // Show two months for easier range selection
                        disabled={disabled} // Disable calendar interaction if needed
                        // *** ADD THIS PROP ***
                        showOutsideDays={false}
                    />
                </PopoverContent>
            </Popover>
        </div>
    )
}