import { z } from 'zod';

export const calendarStatusSuggestions = [
	{ id: 'leave', name: 'Leave', color: '#48bb78', textColor: '#ffffff' },
	{ id: 'school', name: 'School', color: '#4299e1', textColor: '#ffffff' },
	{ id: 'training-tdy', name: 'Training / TDY', color: '#9f7aea', textColor: '#ffffff' },
	{ id: 'appointment', name: 'Appointment', color: '#ed8936', textColor: '#ffffff' },
	{ id: 'sick', name: 'Sick', color: '#e53e3e', textColor: '#ffffff' },
	{ id: 'other-duty-detail', name: 'Other Duty / Detail', color: '#a0522d', textColor: '#ffffff' },
	{ id: 'cq-sd', name: 'CQ/SD', color: '#dc2626', textColor: '#ffffff' }
] as const;

export const calendarAssignmentSuggestions = [
	{ id: 'staff-duty', name: 'Staff Duty', shortName: 'SD', assignTo: 'personnel', color: '#dc2626' }
] as const;

export type CalendarStatusSuggestion = (typeof calendarStatusSuggestions)[number];
export type CalendarAssignmentSuggestion = (typeof calendarAssignmentSuggestions)[number];
export type CalendarSuggestion = CalendarStatusSuggestion | CalendarAssignmentSuggestion;

export const calendarSuggestionsInputSchema = z.object({
	statusIds: z
		.array(z.enum(calendarStatusSuggestions.map(({ id }) => id)))
		.max(calendarStatusSuggestions.length)
		.refine((ids) => new Set(ids).size === ids.length, 'Choose each status suggestion once'),
	assignmentIds: z
		.array(z.enum(calendarAssignmentSuggestions.map(({ id }) => id)))
		.max(calendarAssignmentSuggestions.length)
		.refine((ids) => new Set(ids).size === ids.length, 'Choose each assignment suggestion once')
});

export type CalendarSuggestionsInput = z.infer<typeof calendarSuggestionsInputSchema>;
