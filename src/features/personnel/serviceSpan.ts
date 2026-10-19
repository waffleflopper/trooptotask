import { isDateOnly } from '$lib/utils/dates';

/** Whole years and months from a start day to `today`, as "6 yrs 4 mo"; null for a missing or future start. */
export function formatServiceSpan(start: string | null, today: string): string | null {
	if (!start || !isDateOnly(start) || start > today) return null;
	const [startYear, startMonth, startDay] = start.split('-').map(Number);
	const [year, month, day] = today.split('-').map(Number);
	const months = (year - startYear) * 12 + (month - startMonth) - (day < startDay ? 1 : 0);
	const years = Math.floor(months / 12);
	const rest = months % 12;
	if (years === 0) return rest === 0 ? 'Under 1 mo' : `${rest} mo`;
	const yearText = `${years} ${years === 1 ? 'yr' : 'yrs'}`;
	return rest === 0 ? yearText : `${yearText} ${rest} mo`;
}
