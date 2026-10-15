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

/** "today", "yesterday", "3 days ago" — counted in local calendar days, so 23:00 viewed at 08:00 is "yesterday" */
export function formatRelativeDate(dateStr: string): string {
	const date = new Date(dateStr);
	const diffDays = calendarDayDiff(date, new Date());

	if (diffDays <= 0) return 'today';
	if (diffDays === 1) return 'yesterday';
	if (diffDays < 7) return `${diffDays} days ago`;
	return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Whole local calendar days from `from` to `to`; daylight-saving days still count as one. */
export function calendarDayDiff(from: Date, to: Date): number {
	const day = (date: Date) => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
	return Math.round((day(to) - day(from)) / 86_400_000);
}

/** "YYYY-MM-DD" — for form values and API data */
export function formatDate(date: Date): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

/** Current local "YYYY-MM-DD" date, injectable for timezone-boundary tests */
export function formatToday(date = new Date()): string {
	return formatDate(date);
}

const TIME_ZONE_PATTERN = /^[A-Za-z][A-Za-z0-9_+\-/]*$/;

/** True for an IANA time zone name this runtime recognizes, such as "America/New_York". */
export function isTimeZone(value: unknown): value is string {
	if (typeof value !== 'string' || value.length > 64 || !TIME_ZONE_PATTERN.test(value)) return false;
	try {
		new Intl.DateTimeFormat('en-US', { timeZone: value });
		return true;
	} catch {
		return false;
	}
}

/** The "YYYY-MM-DD" calendar day `now` falls on in `timeZone`. */
export function localDateIn(timeZone: string, now: Date): string {
	return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** True for a strict "YYYY-MM-DD" string naming a real calendar day from year 1000; no timezone is involved. */
export function isDateOnly(value: unknown): value is string {
	if (typeof value !== 'string') return false;
	const match = DATE_ONLY_PATTERN.exec(value);
	if (!match) return false;
	const [year, month, day] = match.slice(1).map(Number);
	if (year < 1000 || month < 1 || month > 12 || day < 1) return false;
	const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
	const daysInMonth = month === 2 ? (leapYear ? 29 : 28) : [4, 6, 9, 11].includes(month) ? 30 : 31;
	return day <= daysInMonth;
}

export function parseDate(dateString: string): Date {
	const [year, month, day] = dateString.split('-').map(Number);
	return new Date(year, month - 1, day);
}

export function getMonthDates(year: number, month: number): Date[] {
	const dates: Date[] = [];
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
		'January',
		'February',
		'March',
		'April',
		'May',
		'June',
		'July',
		'August',
		'September',
		'October',
		'November',
		'December'
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

export function addMonthsClamped(date: Date, months: number): Date {
	const year = date.getFullYear();
	const month = date.getMonth();
	const day = date.getDate();
	const targetMonthIndex = month + months;
	const targetYear = year + Math.floor(targetMonthIndex / 12);
	const normalizedMonth = ((targetMonthIndex % 12) + 12) % 12;
	const lastDayOfTargetMonth = new Date(targetYear, normalizedMonth + 1, 0).getDate();

	return new Date(targetYear, normalizedMonth, Math.min(day, lastDayOfTargetMonth));
}

export function startOfMonth(date: Date): Date {
	return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function endOfMonth(date: Date): Date {
	return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}
