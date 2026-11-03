import type {
	AssignmentType,
	AvailabilityEntry,
	DailyAssignment,
	RosterExcusalSpan
} from '$features/calendar/contracts';

export interface CalendarReportData {
	entries: AvailabilityEntry[];
	assignments?: DailyAssignment[];
	assignmentTypes?: AssignmentType[];
	/** Every excusal overlapping the span, reinstated ones included. */
	excusals?: RosterExcusalSpan[];
}

export async function fetchCalendarReportData(
	orgId: string,
	startDate: string,
	endDate: string,
	signal?: AbortSignal
): Promise<CalendarReportData> {
	const params = new URLSearchParams({ startDate, endDate });
	const response = await fetch(
		`/org/${encodeURIComponent(orgId)}/api/calendar-reports/status-days?${params.toString()}`,
		{ signal }
	);
	if (!response.ok) {
		const body = await response.json().catch(() => ({}));
		throw new Error(body.message || `Request failed (${response.status})`);
	}

	return response.json();
}
