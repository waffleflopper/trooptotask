export const DUTY_ROSTER_DATE_POLICY_TIME_ZONE = 'UTC';

// Duty Roster date-only rules use UTC until the product has an Organization or user timezone setting.
export function dutyRosterTodayDate(now = new Date()): string {
	return dateOnlyUtc(now);
}

export function nextDutyRosterMonthRange(now = new Date()): { startDate: string; endDate: string } {
	const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
	const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 2, 0));
	return {
		startDate: dateOnlyUtc(start),
		endDate: dateOnlyUtc(end)
	};
}

function dateOnlyUtc(date: Date): string {
	const year = date.getUTCFullYear();
	const month = String(date.getUTCMonth() + 1).padStart(2, '0');
	const day = String(date.getUTCDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}
