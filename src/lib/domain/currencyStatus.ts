/**
 * Currency Status — the single, provider-free currency clock behind both
 * Training Type status and Critical Task status (see CONTEXT.md glossary).
 *
 * It answers one question: given an effective expiration date and a set of
 * ordered warning thresholds, is a dated requirement `not-recorded`, `current`,
 * `expiring`, or `expired` as of a reference date?
 *
 * Deliberately shallow surface, deep logic. What it does NOT do (each feature owns these):
 *   - applicability / exemption — a gate that runs BEFORE the core
 *   - color / label text — a presenter that runs AFTER the core
 *   - interpreting a null expiration window — `null` means "never expires" for
 *     Training but "use the org default" for Critical Tasks, so each adapter
 *     resolves its own effective expiration date before calling in.
 *
 * Pure module: no SvelteKit, no Supabase, no I/O. Importable from both client
 * feature utils and server use cases. The only clock dependency is the optional
 * `asOf` param (defaults to now), mirroring the existing ICT status helper.
 *
 * Date-only strings are parsed with `parseDate` (local calendar) on BOTH sides,
 * matching the existing ICT helper and the way Training writes its expiration
 * dates. This deliberately corrects Training's legacy `new Date("YYYY-MM-DD")`
 * read parse, which under-counted by a day west of UTC (a no-op in production,
 * which runs in UTC). See currencyStatus.test.ts for the parity characterization.
 */
import { parseDate } from '$lib/utils/dates';

export type CurrencyState = 'not-recorded' | 'current' | 'expiring' | 'expired';

export interface CurrencyWarnBand {
	id: string; // 'orange' | 'yellow' | 'soon' | ...
	withinDays: number; // inclusive upper bound: matches when daysUntilExpiration <= withinDays
}

export interface CurrencyConfig {
	/** Record carries the expiration date directly; no completion date is required. */
	expirationDateOnly?: boolean;
	/** Matched nearest-first (smallest withinDays wins). */
	warnBands: CurrencyWarnBand[];
}

export interface CurrencyRecord {
	completionDate: string | null;
	/** The EFFECTIVE expiration date, already resolved by the caller. */
	expirationDate: string | null;
}

export interface CurrencyStatusResult {
	state: CurrencyState;
	/** The matched warnBand id when state === 'expiring', else null. */
	band: string | null;
	expirationDate: string | null;
	daysUntilExpiration: number | null;
}

const DAY_MS = 1000 * 60 * 60 * 24;

function resolveAsOfDate(asOf: string | Date | undefined): Date {
	if (!asOf) return new Date();
	return typeof asOf === 'string' ? parseDate(asOf) : asOf;
}

/**
 * The local calendar day reprojected onto a UTC midnight epoch. Differencing two of
 * these counts whole calendar days regardless of timezone OR daylight-saving: a naive
 * `(localMidnight − localMidnight) / DAY_MS` would see a 23h/25h day across a DST
 * transition and `Math.floor` to an off-by-one.
 */
function toCalendarDayMs(date: Date): number {
	return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}

function classify(
	expirationDate: string,
	warnBands: CurrencyWarnBand[],
	asOf: string | Date | undefined
): CurrencyStatusResult {
	// Calendar-day difference (parseDate = local calendar on both sides) → timezone- and DST-independent.
	const days = Math.floor(
		(toCalendarDayMs(parseDate(expirationDate)) - toCalendarDayMs(resolveAsOfDate(asOf))) / DAY_MS
	);

	if (days < 0) {
		return { state: 'expired', band: null, expirationDate, daysUntilExpiration: days };
	}

	// Nearest-first: the smallest matching withinDays wins, independent of config order.
	const orderedBands = [...warnBands].sort((a, b) => a.withinDays - b.withinDays);
	for (const band of orderedBands) {
		if (days <= band.withinDays) {
			return { state: 'expiring', band: band.id, expirationDate, daysUntilExpiration: days };
		}
	}

	return { state: 'current', band: null, expirationDate, daysUntilExpiration: days };
}

const NOT_RECORDED: CurrencyStatusResult = {
	state: 'not-recorded',
	band: null,
	expirationDate: null,
	daysUntilExpiration: null
};

/**
 * Total function classifying a resolved expiration date into a currency state.
 * See the module header for the responsibilities deliberately left to adapters.
 */
export function currencyStatus(
	record: CurrencyRecord | null,
	config: CurrencyConfig,
	asOf?: string | Date
): CurrencyStatusResult {
	if (record == null) return NOT_RECORDED;

	if (config.expirationDateOnly) {
		if (record.expirationDate == null) return NOT_RECORDED;
		return classify(record.expirationDate, config.warnBands, asOf);
	}

	if (record.completionDate == null) return NOT_RECORDED;

	// Completed, but no stored expiration date → current (preserves Training's
	// "has completion, no stored expiration → current" case). Critical Tasks never
	// reaches here: its adapter always supplies a computed expiration date.
	if (record.expirationDate == null) {
		return { state: 'current', band: null, expirationDate: null, daysUntilExpiration: null };
	}

	return classify(record.expirationDate, config.warnBands, asOf);
}
