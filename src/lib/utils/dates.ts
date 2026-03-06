/** "Jan 5, 2026" — for displaying date-only strings (YYYY-MM-DD) */
export function formatDisplayDate(dateStr: string | null): string {
	if (!dateStr) return '-';
	// Append T00:00:00 so date-only strings parse as local time, not UTC
	const d = dateStr.includes('T') ? new Date(dateStr) : new Date(dateStr + 'T00:00:00');
	return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** "Jan 5, 2026, 2:30 PM" — for displaying timestamps */
export function formatDisplayDateTime(dateStr: string | null): string {
	if (!dateStr) return '-';
	return new Date(dateStr).toLocaleDateString('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit'
	});
}

/** "today", "yesterday", "3 days ago" — for relative timestamps */
export function formatRelativeDate(dateStr: string): string {
	const date = new Date(dateStr);
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

	if (diffDays === 0) return 'today';
	if (diffDays === 1) return 'yesterday';
	if (diffDays < 7) return `${diffDays} days ago`;
	return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** "YYYY-MM-DD" — for form values and API data */
export function formatDate(date: Date): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

export function parseDate(dateString: string): Date {
	const [year, month, day] = dateString.split('-').map(Number);
	return new Date(year, month - 1, day);
}

export function getMonthDates(year: number, month: number): Date[] {
	const dates: Date[] = [];
	const firstDay = new Date(year, month, 1);
	const lastDay = new Date(year, month + 1, 0);

	for (let day = 1; day <= lastDay.getDate(); day++) {
		dates.push(new Date(year, month, day));
	}

	return dates;
}

export function isWeekend(date: Date): boolean {
	const day = date.getDay();
	return day === 0 || day === 6;
}

export function isSameDay(date1: Date, date2: Date): boolean {
	return (
		date1.getFullYear() === date2.getFullYear() &&
		date1.getMonth() === date2.getMonth() &&
		date1.getDate() === date2.getDate()
	);
}

export function isToday(date: Date): boolean {
	return isSameDay(date, new Date());
}

export function isDateInRange(date: Date, startDate: string, endDate: string): boolean {
	const dateStr = formatDate(date);
	return dateStr >= startDate && dateStr <= endDate;
}

export function getMonthName(month: number): string {
	const months = [
		'January', 'February', 'March', 'April', 'May', 'June',
		'July', 'August', 'September', 'October', 'November', 'December'
	];
	return months[month];
}

export function getDayName(date: Date, short = true): string {
	const days = short
		? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
		: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
	return days[date.getDay()];
}

export function addMonths(date: Date, months: number): Date {
	const result = new Date(date);
	result.setMonth(result.getMonth() + months);
	return result;
}

export function startOfMonth(date: Date): Date {
	return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function endOfMonth(date: Date): Date {
	return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}
