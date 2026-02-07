export function formatDate(date: Date): string {
	return date.toISOString().split('T')[0];
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
