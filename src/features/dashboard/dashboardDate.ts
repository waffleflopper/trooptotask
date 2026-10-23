import { parseDate } from '$lib/utils/dates';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatDashboardDisplayDate(dateString: string): string {
	const date = parseDate(dateString);
	return `${DAYS[date.getDay()]}, ${MONTHS[date.getMonth()]} ${date.getDate()} ${date.getFullYear()}`;
}

/** "Monday 19 Oct", the Dashboard title for the viewer's day. */
export function formatDashboardTitleDate(dateString: string): string {
	const date = parseDate(dateString);
	return `${DAYS[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]}`;
}
