import type { CalendarSuggestionsInput } from './calendarSuggestions';
import type { CalendarSuggestionsResult } from './contracts';

export async function postCalendarSuggestions(
	orgUrlSegment: string,
	input: CalendarSuggestionsInput
): Promise<CalendarSuggestionsResult> {
	const response = await fetch(`/org/${orgUrlSegment}/api/calendar-suggestions`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(input)
	});
	const payload: unknown = await response.json().catch(() => null);
	if (!response.ok) {
		const message = (payload as { message?: unknown } | null)?.message;
		throw new Error(typeof message === 'string' ? message : 'Could not add the types. Try again.');
	}
	return payload as CalendarSuggestionsResult;
}
