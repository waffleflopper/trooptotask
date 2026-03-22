import type { SpecialDay } from '$lib/types';
import { formatDate } from '$lib/utils/dates';

function getNthWeekdayOfMonth(year: number, month: number, weekday: number, n: number): Date {
	const firstOfMonth = new Date(year, month, 1);
	const firstWeekday = firstOfMonth.getDay();
	let dayOffset = weekday - firstWeekday;
	if (dayOffset < 0) dayOffset += 7;
	const date = 1 + dayOffset + (n - 1) * 7;
	return new Date(year, month, date);
}

function getLastWeekdayOfMonth(year: number, month: number, weekday: number): Date {
	const lastOfMonth = new Date(year, month + 1, 0);
	const lastWeekday = lastOfMonth.getDay();
	let dayOffset = lastWeekday - weekday;
	if (dayOffset < 0) dayOffset += 7;
	return new Date(year, month + 1, -dayOffset);
}

function getObservedDate(date: Date): Date {
	const day = date.getDay();
	if (day === 0) {
		return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
	} else if (day === 6) {
		return new Date(date.getFullYear(), date.getMonth(), date.getDate() - 1);
	}
	return date;
}

export function getFederalHolidays(year: number): SpecialDay[] {
	const holidays: SpecialDay[] = [];

	// New Year's Day - January 1
	const newYears = getObservedDate(new Date(year, 0, 1));
	holidays.push({
		id: `new-years-${year}`,
		date: formatDate(newYears),
		name: "New Year's Day",
		type: 'federal-holiday'
	});

	// Martin Luther King Jr. Day - 3rd Monday of January
	const mlkDay = getNthWeekdayOfMonth(year, 0, 1, 3);
	holidays.push({
		id: `mlk-day-${year}`,
		date: formatDate(mlkDay),
		name: 'Martin Luther King Jr. Day',
		type: 'federal-holiday'
	});

	// Presidents Day - 3rd Monday of February
	const presidentsDay = getNthWeekdayOfMonth(year, 1, 1, 3);
	holidays.push({
		id: `presidents-day-${year}`,
		date: formatDate(presidentsDay),
		name: 'Presidents Day',
		type: 'federal-holiday'
	});

	// Memorial Day - Last Monday of May
	const memorialDay = getLastWeekdayOfMonth(year, 4, 1);
	holidays.push({
		id: `memorial-day-${year}`,
		date: formatDate(memorialDay),
		name: 'Memorial Day',
		type: 'federal-holiday'
	});

	// Juneteenth - June 19
	const juneteenth = getObservedDate(new Date(year, 5, 19));
	holidays.push({
		id: `juneteenth-${year}`,
		date: formatDate(juneteenth),
		name: 'Juneteenth',
		type: 'federal-holiday'
	});

	// Independence Day - July 4
	const independenceDay = getObservedDate(new Date(year, 6, 4));
	holidays.push({
		id: `independence-day-${year}`,
		date: formatDate(independenceDay),
		name: 'Independence Day',
		type: 'federal-holiday'
	});

	// Labor Day - 1st Monday of September
	const laborDay = getNthWeekdayOfMonth(year, 8, 1, 1);
	holidays.push({
		id: `labor-day-${year}`,
		date: formatDate(laborDay),
		name: 'Labor Day',
		type: 'federal-holiday'
	});

	// Columbus Day - 2nd Monday of October
	const columbusDay = getNthWeekdayOfMonth(year, 9, 1, 2);
	holidays.push({
		id: `columbus-day-${year}`,
		date: formatDate(columbusDay),
		name: 'Columbus Day',
		type: 'federal-holiday'
	});

	// Veterans Day - November 11
	const veteransDay = getObservedDate(new Date(year, 10, 11));
	holidays.push({
		id: `veterans-day-${year}`,
		date: formatDate(veteransDay),
		name: 'Veterans Day',
		type: 'federal-holiday'
	});

	// Thanksgiving Day - 4th Thursday of November
	const thanksgiving = getNthWeekdayOfMonth(year, 10, 4, 4);
	holidays.push({
		id: `thanksgiving-${year}`,
		date: formatDate(thanksgiving),
		name: 'Thanksgiving Day',
		type: 'federal-holiday'
	});

	// Christmas Day - December 25
	const christmas = getObservedDate(new Date(year, 11, 25));
	holidays.push({
		id: `christmas-${year}`,
		date: formatDate(christmas),
		name: 'Christmas Day',
		type: 'federal-holiday'
	});

	return holidays;
}

export function getDefaultFederalHolidays(): SpecialDay[] {
	const currentYear = new Date().getFullYear();
	return [
		...getFederalHolidays(currentYear - 1),
		...getFederalHolidays(currentYear),
		...getFederalHolidays(currentYear + 1),
		...getFederalHolidays(currentYear + 2)
	];
}
