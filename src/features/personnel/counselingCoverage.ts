const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

export const COVERAGE_MONTH_COUNT = 12;

export interface CoverageMonth {
	/** `YYYY-MM` */
	key: string;
	/** `Oct` */
	label: string;
	covered: boolean;
}

function monthIndex(day: string): number {
	return Number(day.slice(0, 4)) * 12 + Number(day.slice(5, 7)) - 1;
}

function monthKey(index: number): string {
	return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
}

/** Keys of the viewer's current month and the eleven before it, oldest first. */
export function coverageWindow(asOf: string): string[] {
	const current = monthIndex(asOf);
	return Array.from({ length: COVERAGE_MONTH_COUNT }, (_, i) => monthKey(current - (COVERAGE_MONTH_COUNT - 1) + i));
}

/** First day of the window, so a read can fetch only the dates the bar needs. */
export function coverageWindowStart(asOf: string): string {
	return `${coverageWindow(asOf)[0]}-01`;
}

/** The months of `dates` that fall inside the window ending at `asOf`, as `YYYY-MM` keys. */
export function coveredMonthsOf(dates: readonly string[], asOf: string): string[] {
	const window = new Set(coverageWindow(asOf));
	return [...new Set(dates.map((date) => date.slice(0, 7)).filter((key) => window.has(key)))];
}

export function coverageMonths(asOf: string, coveredMonths: readonly string[]): CoverageMonth[] {
	const covered = new Set(coveredMonths);
	return coverageWindow(asOf).map((key) => ({
		key,
		label: SHORT_MONTHS[Number(key.slice(5, 7)) - 1],
		covered: covered.has(key)
	}));
}

/** `10 of the last 12 months have a counseling on record. Gaps in Jun and Jul.` */
export function coverageCaption(months: readonly CoverageMonth[]): string {
	const gaps = months.filter((month) => !month.covered).map((month) => month.label);
	const head = `${months.length - gaps.length} of the last ${months.length} months have a counseling on record.`;
	if (gaps.length === 0) return head;
	const list = gaps.length === 1 ? gaps[0] : `${gaps.slice(0, -1).join(', ')} and ${gaps[gaps.length - 1]}`;
	return `${head} Gaps in ${list}.`;
}

/** Whole days from `date` to `asOf`, both `YYYY-MM-DD`. */
export function daysBetween(date: string, asOf: string): number {
	const utc = (day: string) => Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)));
	return Math.round((utc(asOf) - utc(date)) / 86_400_000);
}

/** `Last counseled 24 days ago`; `No counseling on record` before the first. */
export function lastCounseledLabel(lastConductedOn: string | null, asOf: string): string {
	if (!lastConductedOn) return 'No counseling on record';
	const days = daysBetween(lastConductedOn, asOf);
	if (days <= 0) return 'Last counseled today';
	if (days === 1) return 'Last counseled yesterday';
	return `Last counseled ${days} days ago`;
}
