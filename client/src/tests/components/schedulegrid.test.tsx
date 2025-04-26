import React from 'react';
import {render, screen, waitForElementToBeRemoved} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

import ScheduleGrid from '../../components/schedulegrid';
import { type ScheduleData, type ScheduleEvent } from '@emporte/common';
import { toast } from 'sonner';

vi.mock('sonner', () => ({
    toast: {
        success: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
        warning: vi.fn(),
    },
}));

const mockedToast = vi.mocked(toast);

const createMockEvent = (overrides: Partial<ScheduleEvent> = {}): ScheduleEvent => ({
    courseCode: 'COURSE101',
    courseName: 'Introduction to Testing',
    sectionDetails: 'A',
    days: ['Monday', 'Wednesday'],
    startTime: '9:00 AM',
    endTime: '10:30 AM',
    location: 'Room 101',
    ...overrides,
});

describe('ScheduleGrid', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    const mockOnUpdateEvent = vi.fn();

    const baseScheduleData: ScheduleData = {
        termStartDate: '2024-09-01',
        termEndDate: '2024-12-15',
        scheduleEvents: [
            createMockEvent({ courseCode: 'C101', days: ['Monday', 'Wednesday'], startTime: '9:00 AM', endTime: '10:00 AM'}),
            createMockEvent({ courseCode: 'CSE202', courseName: 'Event To Rename', days: ['Tuesday'], startTime: '1:00 PM', endTime: '2:00 PM'}),
            createMockEvent({ courseCode: 'C303', days: ['Friday'], startTime: '11:00 AM', endTime: '12:00 PM'}),
        ],
    };

    const mockScheduleData: ScheduleData = {
        termStartDate: '2024-09-01',
        termEndDate: '2024-12-15',
        scheduleEvents: [
            createMockEvent({
                courseCode: 'COURSE101', courseName: 'Introduction to Testing', sectionDetails: 'A',
                days: ['Monday', 'Wednesday'], startTime: '9:00 AM', endTime: '10:30 AM', location: 'Room 101',
            }),
            createMockEvent({
                courseCode: 'EVENT_TO_EDIT', courseName: 'Initial Edit Name', sectionDetails: 'B',
                days: ['Tuesday'],
                startTime: '1:00 PM', endTime: '2:00 PM', location: 'Initial Edit Location',
            }),
            createMockEvent({
                courseCode: 'COURSE303', courseName: 'Friday Fun', sectionDetails: 'C',
                days: ['Friday'], startTime: '11:00 AM', endTime: '12:00 PM', location: 'Lab B',
            }),
        ],
    };

    it('should render schedule grid with time labels, day headers, and events', () => {
        render(<ScheduleGrid scheduleData={mockScheduleData} onUpdateEvent={mockOnUpdateEvent} />);

        expect(screen.getByText('MON')).toBeInTheDocument();
        expect(screen.getByText('TUE')).toBeInTheDocument();
        expect(screen.getByText('WED')).toBeInTheDocument();
        expect(screen.getByText('THU')).toBeInTheDocument();
        expect(screen.getByText('FRI')).toBeInTheDocument();

        expect(screen.getByText('9:00 AM')).toBeInTheDocument();
        expect(screen.getByText('10:00 AM')).toBeInTheDocument();
        expect(screen.getByText('1:00 PM')).toBeInTheDocument();
        expect(screen.getByText('2:00 PM')).toBeInTheDocument();

        const course101Events = screen.getAllByText(/COURSE101/);
        expect(course101Events.length).toBeGreaterThanOrEqual(1);
        expect(course101Events[0]).toBeInTheDocument();

        const course202Events = screen.getAllByText(/EVENT_TO_EDIT/);
        expect(course202Events.length).toBeGreaterThanOrEqual(1);
        expect(course202Events[0]).toBeInTheDocument();

        const course303Events = screen.getAllByText(/COURSE303/);
        expect(course303Events.length).toBeGreaterThanOrEqual(1);
        expect(course303Events[0]).toBeInTheDocument();

        expect(screen.getByRole('grid')).toBeInTheDocument();
        expect(screen.getAllByText(/COURSE101 \(A\)/)[0]).toBeInTheDocument();
        expect(screen.getAllByText(/EVENT_TO_EDIT \(B\)/)[0]).toBeInTheDocument();
        expect(screen.getAllByText(/COURSE303 \(C\)/)[0]).toBeInTheDocument();
    });

    it('should open the edit popover with correct data when an event is clicked', async () => {
        const user = userEvent.setup();
        render(<ScheduleGrid scheduleData={mockScheduleData} onUpdateEvent={mockOnUpdateEvent} />);

        const eventElements = screen.getAllByTitle('Edit: EVENT_TO_EDIT...');
        expect(eventElements.length).toBeGreaterThan(0);
        await user.click(eventElements[0]);

        const popoverTitle = await screen.findByText('Edit Event');
        expect(popoverTitle).toBeInTheDocument();

        expect(await screen.findByLabelText('Course Code')).toHaveValue('EVENT_TO_EDIT');
        expect(await screen.findByLabelText('Course Name')).toHaveValue('Initial Edit Name');
        expect(await screen.findByLabelText('Location')).toHaveValue('Initial Edit Location');

        const tuesdayToggle = await screen.findByRole('button', { name: 'Toggle Tuesday' });
        const mondayToggle = await screen.findByRole('button', { name: 'Toggle Monday' });
        expect(tuesdayToggle).toHaveAttribute('data-state', 'on');
        expect(mondayToggle).toHaveAttribute('data-state', 'off');

        expect(screen.getByRole('button', { name: 'Save Changes' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    });

    it('should update form fields, call onUpdateEvent on save, and close popover', async () => {
        const user = userEvent.setup();
        render(<ScheduleGrid scheduleData={mockScheduleData} onUpdateEvent={mockOnUpdateEvent} />);

        const eventElement = screen.getAllByTitle('Edit: EVENT_TO_EDIT...')[0];
        await user.click(eventElement);
        await screen.findByText('Edit Event');

        const courseNameInput = screen.getByLabelText('Course Name');
        const locationInput = screen.getByLabelText('Location');
        const tuesdayToggle = screen.getByRole('button', { name: 'Toggle Tuesday' });
        const fridayToggle = screen.getByRole('button', { name: 'Toggle Friday' });
        const saveButton = screen.getByRole('button', { name: 'Save Changes' });

        const updatedCourseName = 'Updated Course Name';
        const updatedLocation = 'Updated Location';

        await user.clear(courseNameInput);
        await user.type(courseNameInput, updatedCourseName);
        await user.clear(locationInput);
        await user.type(locationInput, updatedLocation);
        await user.click(tuesdayToggle);
        await user.click(fridayToggle);

        await user.click(saveButton);

        expect(mockOnUpdateEvent).toHaveBeenCalledTimes(1);
        expect(mockOnUpdateEvent).toHaveBeenCalledWith(
            1,
            expect.objectContaining({
                courseCode: 'EVENT_TO_EDIT',
                courseName: updatedCourseName,
                sectionDetails: 'B',
                days: ['Friday'],
                startTime: '1:00 PM',
                endTime: '2:00 PM',
                location: updatedLocation,
            })
        );

        expect(screen.queryByText('Edit Event')).not.toBeInTheDocument();
        expect(screen.queryByLabelText('Course Name')).not.toBeInTheDocument();
    });

    it('SHOULD NOT lose specific color when courseCode is edited and component rerenders', async () => {
        const user = userEvent.setup();
        const { rerender } = render(<ScheduleGrid scheduleData={baseScheduleData} onUpdateEvent={mockOnUpdateEvent} />);

        const eventToRenameElements = screen.getAllByTitle('Edit: CSE202...');
        expect(eventToRenameElements.length).toBeGreaterThan(0);
        const eventElement = eventToRenameElements[0].closest('div[title^="Edit:"]');
        expect(eventElement).toBeInTheDocument();

        const initialBgClass = Array.from(eventElement!.classList).find(cls => cls.startsWith('bg-'));
        expect(initialBgClass).toBeDefined();

        await user.click(eventElement!);
        const courseCodeInput = await screen.findByLabelText('Course Code');
        const saveButton = screen.getByRole('button', { name: 'Save Changes' });
        const newCourseCode = 'CSE 202';

        await user.clear(courseCodeInput);
        await user.type(courseCodeInput, newCourseCode);
        await user.click(saveButton);

        expect(mockOnUpdateEvent).toHaveBeenCalledTimes(1);
        const updatedEventData = mockOnUpdateEvent.mock.calls[0][1];
        expect(updatedEventData.courseCode).toBe(newCourseCode);
        const originalIndex = mockOnUpdateEvent.mock.calls[0][0];

        const newScheduleEvents = [...baseScheduleData.scheduleEvents];
        newScheduleEvents[originalIndex] = updatedEventData;
        const updatedScheduleData = { ...baseScheduleData, scheduleEvents: newScheduleEvents };
        rerender(<ScheduleGrid scheduleData={updatedScheduleData} onUpdateEvent={mockOnUpdateEvent} />);

        const rerenderedEventElement = screen.getByTitle(`Edit: ${newCourseCode}...`);
        expect(rerenderedEventElement).toBeInTheDocument();


        expect(rerenderedEventElement).toHaveClass(initialBgClass!);

    });

    it('SHOULD lose specific color when courseCode is edited and component rerenders', async () => {
        const user = userEvent.setup();
        const { rerender } = render(<ScheduleGrid scheduleData={baseScheduleData} onUpdateEvent={mockOnUpdateEvent} />);

        const eventToRenameElements = screen.getAllByTitle('Edit: CSE202...');
        expect(eventToRenameElements.length).toBeGreaterThan(0);
        const eventElement = eventToRenameElements[0].closest('div[title^="Edit:"]');
        expect(eventElement).toBeInTheDocument();

        const initialBgClass = Array.from(eventElement!.classList).find(cls => cls.startsWith('bg-'));
        expect(initialBgClass).toBeDefined();

        await user.click(eventElement!);
        const courseCodeInput = await screen.findByLabelText('Course Code');
        const saveButton = screen.getByRole('button', { name: 'Save Changes' });
        const newCourseCode = 'RENAMED999';

        await user.clear(courseCodeInput);
        await user.type(courseCodeInput, newCourseCode);
        await user.click(saveButton);

        expect(mockOnUpdateEvent).toHaveBeenCalledTimes(1);
        const updatedEventData = mockOnUpdateEvent.mock.calls[0][1];
        expect(updatedEventData.courseCode).toBe(newCourseCode);
        const originalIndex = mockOnUpdateEvent.mock.calls[0][0];

        const newScheduleEvents = [...baseScheduleData.scheduleEvents];
        newScheduleEvents[originalIndex] = updatedEventData;
        const updatedScheduleData = { ...baseScheduleData, scheduleEvents: newScheduleEvents };
        rerender(<ScheduleGrid scheduleData={updatedScheduleData} onUpdateEvent={mockOnUpdateEvent} />);

        const rerenderedEventElement = screen.getByTitle(`Edit: ${newCourseCode}...`);
        expect(rerenderedEventElement).toBeInTheDocument();


        expect(rerenderedEventElement).not.toHaveClass(initialBgClass!);

    });

    it('should render headers and time slots correctly with empty scheduleEvents', () => {
        const emptyScheduleData: ScheduleData = { ...baseScheduleData, scheduleEvents: [] };
        render(<ScheduleGrid scheduleData={emptyScheduleData} onUpdateEvent={mockOnUpdateEvent} />);

        expect(screen.getByText('MON')).toBeInTheDocument();
        expect(screen.getByText('FRI')).toBeInTheDocument();
        expect(screen.getAllByText(/:00\s*(AM|PM)/i).length).toBeGreaterThan(0);

        expect(screen.queryByTitle(/Edit:/)).not.toBeInTheDocument();
    });

    it('should show validation error and not save if no days are selected', async () => {
        const user = userEvent.setup();
        render(<ScheduleGrid scheduleData={baseScheduleData} onUpdateEvent={mockOnUpdateEvent} />);

        const eventElements = screen.getAllByTitle('Edit: C101...');
        expect(eventElements.length).toBeGreaterThan(0);
        const eventElement = eventElements[0];
        await user.click(eventElement);
        await screen.findByText('Edit Event');

        const mondayToggle = screen.getByRole('button', { name: 'Toggle Monday' });
        const wednesdayToggle = screen.getByRole('button', { name: 'Toggle Wednesday' });
        const saveButton = screen.getByRole('button', { name: 'Save Changes' });

        expect(mondayToggle).toHaveAttribute('data-state', 'on');
        expect(wednesdayToggle).toHaveAttribute('data-state', 'on');

        await user.click(mondayToggle);
        await user.click(wednesdayToggle);

        expect(mondayToggle).toHaveAttribute('data-state', 'off');
        expect(wednesdayToggle).toHaveAttribute('data-state', 'off');

        await user.click(saveButton);

        expect(mockedToast.error).toHaveBeenCalledTimes(1);
        expect(mockedToast.error).toHaveBeenCalledWith(
            expect.stringContaining("Missing Days"),
            expect.any(Object)
        );

        expect(mockOnUpdateEvent).not.toHaveBeenCalled();

        expect(screen.getByText('Edit Event')).toBeInTheDocument();
    });

    it('should close the popover without calling onUpdateEvent when Cancel is clicked', async () => {
        const user = userEvent.setup();
        render(<ScheduleGrid scheduleData={baseScheduleData} onUpdateEvent={mockOnUpdateEvent} />);

        const eventElement = screen.getAllByTitle('Edit: C101...')[0];
        await user.click(eventElement);
        await screen.findByText('Edit Event');

        const cancelButton = screen.getByRole('button', { name: 'Cancel' });
        await user.click(cancelButton);

        expect(screen.queryByText('Edit Event')).not.toBeInTheDocument();

        expect(mockOnUpdateEvent).not.toHaveBeenCalled();
    });

    it('should render without error when optional fields are null', () => {
        const dataWithNulls: ScheduleData = {
            ...baseScheduleData,
            scheduleEvents: [
                createMockEvent({ courseCode: 'NULL1', courseName: null, sectionDetails: null, location: null, days: ['Monday'], startTime: '10:00 AM', endTime: '11:00 AM' })
            ]
        };
        render(<ScheduleGrid scheduleData={dataWithNulls} onUpdateEvent={mockOnUpdateEvent} />);

        expect(screen.getByTitle('Edit: NULL1...')).toBeInTheDocument();
        expect(screen.getByText('NULL1')).toBeInTheDocument();
    });

    it('should render gracefully and skip events with invalid time ranges initially', () => {
        const dataWithInvalidEvent: ScheduleData = {
            ...baseScheduleData,
            scheduleEvents: [
                createMockEvent({ courseCode: 'VALID1', days: ['Monday'], startTime: '9:00 AM', endTime: '10:00 AM'}),
                createMockEvent({ courseCode: 'INVALID_TIME', days: ['Tuesday'], startTime: '11:00 AM', endTime: '10:00 AM'}),
                createMockEvent({ courseCode: 'VALID2', days: ['Wednesday'], startTime: '1:00 PM', endTime: '2:00 PM'}),
            ]
        };
        render(<ScheduleGrid scheduleData={dataWithInvalidEvent} onUpdateEvent={mockOnUpdateEvent} />);

        expect(screen.getByTitle('Edit: VALID1...')).toBeInTheDocument();
        expect(screen.getByTitle('Edit: VALID2...')).toBeInTheDocument();

        expect(screen.queryByTitle('Edit: INVALID_TIME...')).not.toBeInTheDocument();
        expect(screen.queryByText(/INVALID_TIME/)).not.toBeInTheDocument();
    });
});
