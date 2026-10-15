import { parseDate } from '$lib/utils/dates';

/** The instants bounding the viewer's From and To days; To is exclusive at the next local midnight. */
export function rosterCreatedRange(dateFrom: string, dateTo: string): { createdFrom?: string; createdBefore?: string } {
	const range: { createdFrom?: string; createdBefore?: string } = {};
	if (dateFrom) range.createdFrom = parseDate(dateFrom).toISOString();
	if (dateTo) {
		const nextDay = parseDate(dateTo);
		nextDay.setDate(nextDay.getDate() + 1);
		range.createdBefore = nextDay.toISOString();
	}
	return range;
}
