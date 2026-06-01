import type { AssignmentType, AvailabilityEntry, DailyAssignment } from '$lib/types';

export interface CalendarReportData {
	entries: AvailabilityEntry[];
	assignments?: DailyAssignment[];
	assignmentTypes?: AssignmentType[];
}

export async function fetchCalendarReportData(
	orgId: string,
	startDate: string,
	endDate: string
): Promise<CalendarReportData> {
	const response = await fetch(
		`/org/${orgId}/api/calendar-reports/status-days?startDate=${startDate}&endDate=${endDate}`
	);
	if (!response.ok) {
		const body = await response.json().catch(() => ({}));
		throw new Error(body.message || `Request failed (${response.status})`);
	}

	return response.json();
}
