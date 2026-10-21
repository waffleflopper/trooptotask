import { describe, expect, it } from 'vitest';
import { currencyStatus, type CurrencyConfig } from './currencyStatus';

// Two-band Training-shaped config (matched nearest-first: orange tighter than yellow).
const TRAINING_BANDS: CurrencyConfig = {
	warnBands: [
		{ id: 'orange', withinDays: 30 },
		{ id: 'yellow', withinDays: 60 }
	]
};

// Single-band Critical-Tasks-shaped config.
const ICT_BANDS: CurrencyConfig = {
	warnBands: [{ id: 'soon', withinDays: 60 }]
};

const ASOF = '2026-04-14';

const DAY_MS = 86_400_000;

/** In UTC this equals the calendar difference; west of UTC it under-counts by one day. */
function legacyTrainingDays(expirationDate: string, asOf: string): number {
	const today = new Date(`${asOf}T00:00:00`);
	today.setHours(0, 0, 0, 0);
	const expiration = new Date(expirationDate);
	expiration.setHours(0, 0, 0, 0);
	return Math.floor((expiration.getTime() - today.getTime()) / DAY_MS);
}

describe('currencyStatus core', () => {
	it('returns not-recorded for a null record', () => {
		expect(currencyStatus(null, ICT_BANDS, ASOF)).toEqual({
			state: 'not-recorded',
			band: null,
			expirationDate: null,
			daysUntilExpiration: null
		});
	});

	describe('expirationDateOnly records', () => {
		const config: CurrencyConfig = { expirationDateOnly: true, warnBands: TRAINING_BANDS.warnBands };

		it('is not-recorded when no expiration date is stored', () => {
			expect(currencyStatus({ completionDate: null, expirationDate: null }, config, ASOF)).toEqual({
				state: 'not-recorded',
				band: null,
				expirationDate: null,
				daysUntilExpiration: null
			});
		});

		it('classifies directly from the stored expiration date (no completion needed)', () => {
			expect(currencyStatus({ completionDate: null, expirationDate: '2026-07-14' }, config, ASOF)).toEqual({
				state: 'current',
				band: null,
				expirationDate: '2026-07-14',
				daysUntilExpiration: 91
			});
			expect(currencyStatus({ completionDate: null, expirationDate: '2026-04-13' }, config, ASOF)).toEqual({
				state: 'expired',
				band: null,
				expirationDate: '2026-04-13',
				daysUntilExpiration: -1
			});
		});
	});

	describe('completion-based records', () => {
		it('is not-recorded when there is no completion date', () => {
			expect(currencyStatus({ completionDate: null, expirationDate: '2026-07-14' }, TRAINING_BANDS, ASOF)).toEqual({
				state: 'not-recorded',
				band: null,
				expirationDate: null,
				daysUntilExpiration: null
			});
		});

		it('is current with null days when completed but no expiration date is stored', () => {
			expect(currencyStatus({ completionDate: '2026-01-01', expirationDate: null }, TRAINING_BANDS, ASOF)).toEqual({
				state: 'current',
				band: null,
				expirationDate: null,
				daysUntilExpiration: null
			});
		});
	});

	describe('classify', () => {
		function classify(expirationDate: string, config = TRAINING_BANDS) {
			return currencyStatus({ completionDate: '2025-01-01', expirationDate }, config, ASOF);
		}

		it('is expired when days < 0', () => {
			expect(classify('2026-04-13')).toMatchObject({ state: 'expired', band: null, daysUntilExpiration: -1 });
		});

		it('treats the threshold day itself as expiring (inclusive <=)', () => {
			expect(classify('2026-05-14')).toMatchObject({ state: 'expiring', band: 'orange', daysUntilExpiration: 30 });
			expect(classify('2026-06-13')).toMatchObject({ state: 'expiring', band: 'yellow', daysUntilExpiration: 60 });
		});

		it('selects the nearest band first (orange before yellow)', () => {
			expect(classify('2026-05-15')).toMatchObject({ state: 'expiring', band: 'yellow', daysUntilExpiration: 31 });
			expect(classify('2026-04-29')).toMatchObject({ state: 'expiring', band: 'orange', daysUntilExpiration: 15 });
		});

		it('is current beyond all bands', () => {
			expect(classify('2026-07-14')).toMatchObject({ state: 'current', band: null, daysUntilExpiration: 91 });
		});

		it('selects nearest band regardless of warnBand ordering in config', () => {
			const unordered: CurrencyConfig = {
				warnBands: [
					{ id: 'yellow', withinDays: 60 },
					{ id: 'orange', withinDays: 30 }
				]
			};
			expect(classify('2026-04-29', unordered)).toMatchObject({ state: 'expiring', band: 'orange' });
		});
	});

	describe('asOf injection / day-count parity', () => {
		it('produces deterministic day counts from the injected asOf', () => {
			expect(
				currencyStatus({ completionDate: '2025-01-01', expirationDate: '2026-04-24' }, ICT_BANDS, ASOF)
			).toMatchObject({
				daysUntilExpiration: 10
			});
		});

		it('counts the pure calendar difference (parseDate on both sides)', () => {
			expect(
				currencyStatus({ completionDate: '2025-01-01', expirationDate: '2026-12-31' }, ICT_BANDS, '2026-01-01')
			).toMatchObject({ daysUntilExpiration: 364 });
		});

		it('counts whole calendar days across a DST spring-forward transition', () => {
			// US spring-forward is 2026-03-08. A naive (localMidnight − localMidnight)/DAY_MS
			// floor returns 27 in a DST-observing timezone; calendar-day math returns 28.
			expect(
				currencyStatus({ completionDate: '2025-01-01', expirationDate: '2026-03-14' }, ICT_BANDS, '2026-02-14')
					.daysUntilExpiration
			).toBe(28);
		});

		it('counts whole calendar days across a DST fall-back transition', () => {
			// US fall-back is 2026-11-01 (a 25h local day). Here naive elapsed-ms/floor also
			// yields 30 — only spring-forward under-counts — so this pins that calendar-day
			// counting stays correct across the fall-back boundary in either direction.
			expect(
				currencyStatus({ completionDate: '2025-01-01', expirationDate: '2026-11-14' }, ICT_BANDS, '2026-10-15')
					.daysUntilExpiration
			).toBe(30);
		});

		// It also guards against a regression to `new Date(dateOnly)` parsing in the core.
		it('uses calendar-day semantics, diverging from the legacy Training parse west of UTC', () => {
			const asOf = '2026-04-14';
			const expiration = '2026-05-14';

			const core = currencyStatus(
				{ completionDate: '2025-01-01', expirationDate: expiration },
				ICT_BANDS,
				asOf
			).daysUntilExpiration;
			expect(core).toBe(30);

			// The legacy Training parse agreed in UTC/east-of-UTC but under-counted by one west of UTC.
			const westOfUtc = new Date(2026, 3, 14).getTimezoneOffset() > 0;
			expect(legacyTrainingDays(expiration, asOf)).toBe(westOfUtc ? 29 : 30);
		});

		it('defaults asOf to today when omitted', () => {
			// Far-future expiration is current regardless of the real clock.
			expect(currencyStatus({ completionDate: '2025-01-01', expirationDate: '2999-01-01' }, ICT_BANDS).state).toBe(
				'current'
			);
		});
	});
});
