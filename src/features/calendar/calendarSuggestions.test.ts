import { describe, expect, it } from 'vitest';
import { calendarSuggestionsInputSchema } from './calendarSuggestions';

describe('Calendar suggestion input', () => {
	it('accepts empty picks and independently selected status and assignment presets', () => {
		expect(calendarSuggestionsInputSchema.parse({ statusIds: [], assignmentIds: [] })).toEqual({
			statusIds: [],
			assignmentIds: []
		});
		expect(
			calendarSuggestionsInputSchema.parse({ statusIds: ['leave', 'cq-sd'], assignmentIds: ['staff-duty'] })
		).toEqual({ statusIds: ['leave', 'cq-sd'], assignmentIds: ['staff-duty'] });
	});

	it.each([
		{ statusIds: ['unknown'], assignmentIds: [] },
		{ statusIds: [], assignmentIds: ['unknown'] },
		{ statusIds: ['leave', 'leave'], assignmentIds: [] },
		{ statusIds: [], assignmentIds: ['staff-duty', 'staff-duty'] }
	])('rejects unknown or duplicate ids in either catalog', (input) => {
		expect(calendarSuggestionsInputSchema.safeParse(input).success).toBe(false);
	});
});
