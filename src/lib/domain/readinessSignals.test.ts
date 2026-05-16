/**
 * Tests for the shared upcoming-loss evaluation path.
 *
 * Tests verify external behavior: who appears in the list, how entries are labeled and ordered,
 * when award-due signals fire, and how edge cases (both dates, past dates, boundary days) resolve.
 * No coupling to implementation internals.
 */
import { describe, it, expect } from 'vitest';
import { evaluateUpcomingLosses } from './readinessSignals';
import type { Personnel } from '$lib/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePerson(overrides: Partial<Personnel> = {}): Personnel {
	return {
		id: 'p1',
		rank: 'SGT',
		lastName: 'Smith',
		firstName: 'John',
		mos: '11B',
		clinicRole: '',
		ets: null,
		deros: null,
		groupId: null,
		groupName: '',
		archivedAt: null,
		...overrides
	};
}

/** Returns a YYYY-MM-DD date string offset by `days` from `base` */
function addDays(base: string, days: number): string {
	const d = new Date(base + 'T00:00:00');
	d.setDate(d.getDate() + days);
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, '0');
	const day = String(d.getDate()).padStart(2, '0');
	return `${y}-${m}-${day}`;
}

const TODAY = '2026-04-14';
const WINDOW = 180;

// ---------------------------------------------------------------------------
// Tracer bullet: no personnel data → empty result
// ---------------------------------------------------------------------------

describe('evaluateUpcomingLosses', () => {
	it('returns an empty array when there are no personnel', () => {
		const result = evaluateUpcomingLosses([], WINDOW, TODAY);
		expect(result).toEqual([]);
	});

	// -------------------------------------------------------------------------
	// Exclusion: no tracked dates
	// -------------------------------------------------------------------------

	it('omits personnel with no ETS or DEROS dates', () => {
		const person = makePerson({ ets: null, deros: null });
		const result = evaluateUpcomingLosses([person], WINDOW, TODAY);
		expect(result).toHaveLength(0);
	});

	// -------------------------------------------------------------------------
	// ETS-only cases
	// -------------------------------------------------------------------------

	it('includes a person whose ETS falls within the warning window', () => {
		const etsDate = addDays(TODAY, 90);
		const person = makePerson({ id: 'p1', ets: etsDate });
		const result = evaluateUpcomingLosses([person], WINDOW, TODAY);

		expect(result).toHaveLength(1);
		expect(result[0].triggerType).toBe('ETS');
		expect(result[0].targetDate).toBe(etsDate);
	});

	it('labels ETS-triggered entries as "ETS"', () => {
		const person = makePerson({ id: 'p1', ets: addDays(TODAY, 45) });
		const [entry] = evaluateUpcomingLosses([person], WINDOW, TODAY);
		expect(entry.triggerType).toBe('ETS');
	});

	it('excludes a person whose ETS falls beyond the warning window', () => {
		const person = makePerson({ ets: addDays(TODAY, WINDOW + 1) });
		const result = evaluateUpcomingLosses([person], WINDOW, TODAY);
		expect(result).toHaveLength(0);
	});

	it('excludes a person whose ETS is in the past', () => {
		const person = makePerson({ ets: addDays(TODAY, -1) });
		const result = evaluateUpcomingLosses([person], WINDOW, TODAY);
		expect(result).toHaveLength(0);
	});

	// -------------------------------------------------------------------------
	// Boundary: last day of window is included; day after is excluded
	// -------------------------------------------------------------------------

	it('includes ETS exactly on the last day of the window (boundary inclusive)', () => {
		const person = makePerson({ ets: addDays(TODAY, WINDOW) });
		const result = evaluateUpcomingLosses([person], WINDOW, TODAY);
		expect(result).toHaveLength(1);
	});

	it('excludes ETS one day past the window boundary', () => {
		const person = makePerson({ ets: addDays(TODAY, WINDOW + 1) });
		const result = evaluateUpcomingLosses([person], WINDOW, TODAY);
		expect(result).toHaveLength(0);
	});

	it('includes ETS when the date is today (daysRemaining = 0)', () => {
		const person = makePerson({ ets: TODAY });
		const result = evaluateUpcomingLosses([person], WINDOW, TODAY);
		expect(result).toHaveLength(1);
		expect(result[0].daysRemaining).toBe(0);
	});

	// -------------------------------------------------------------------------
	// DEROS-only cases
	// -------------------------------------------------------------------------

	it('includes a person whose DEROS falls within the warning window', () => {
		const derosDate = addDays(TODAY, 60);
		const person = makePerson({ id: 'p2', deros: derosDate });
		const result = evaluateUpcomingLosses([person], WINDOW, TODAY);

		expect(result).toHaveLength(1);
		expect(result[0].triggerType).toBe('PCS / DEROS');
		expect(result[0].targetDate).toBe(derosDate);
	});

	it('labels DEROS-triggered entries as "PCS / DEROS"', () => {
		const person = makePerson({ deros: addDays(TODAY, 30) });
		const [entry] = evaluateUpcomingLosses([person], WINDOW, TODAY);
		expect(entry.triggerType).toBe('PCS / DEROS');
	});

	it('excludes a person whose DEROS falls beyond the warning window', () => {
		const person = makePerson({ deros: addDays(TODAY, WINDOW + 5) });
		const result = evaluateUpcomingLosses([person], WINDOW, TODAY);
		expect(result).toHaveLength(0);
	});

	// -------------------------------------------------------------------------
	// Both dates in window: show the nearer one only
	// -------------------------------------------------------------------------

	it('shows only the nearer date when both ETS and DEROS are in-window', () => {
		const person = makePerson({
			id: 'p3',
			ets: addDays(TODAY, 60), // farther
			deros: addDays(TODAY, 30) // nearer
		});
		const result = evaluateUpcomingLosses([person], WINDOW, TODAY);

		expect(result).toHaveLength(1);
		expect(result[0].triggerType).toBe('PCS / DEROS');
		expect(result[0].daysRemaining).toBe(30);
	});

	it('shows ETS when ETS is nearer than DEROS and both are in-window', () => {
		const person = makePerson({
			ets: addDays(TODAY, 20),
			deros: addDays(TODAY, 50)
		});
		const [entry] = evaluateUpcomingLosses([person], WINDOW, TODAY);
		expect(entry.triggerType).toBe('ETS');
	});

	it('shows DEROS when only DEROS is in-window and ETS is beyond window', () => {
		const person = makePerson({
			ets: addDays(TODAY, WINDOW + 10),
			deros: addDays(TODAY, 45)
		});
		const [entry] = evaluateUpcomingLosses([person], WINDOW, TODAY);
		expect(entry.triggerType).toBe('PCS / DEROS');
	});

	// -------------------------------------------------------------------------
	// Ordering: sorted by nearest date first (ascending daysRemaining)
	// -------------------------------------------------------------------------

	it('orders results by nearest date first across multiple personnel', () => {
		const people = [
			makePerson({ id: 'p1', ets: addDays(TODAY, 90) }),
			makePerson({ id: 'p2', ets: addDays(TODAY, 30) }),
			makePerson({ id: 'p3', deros: addDays(TODAY, 60) })
		];
		const result = evaluateUpcomingLosses(people, WINDOW, TODAY);

		expect(result).toHaveLength(3);
		expect(result[0].daysRemaining).toBeLessThanOrEqual(result[1].daysRemaining);
		expect(result[1].daysRemaining).toBeLessThanOrEqual(result[2].daysRemaining);
	});

	it('returns the soonest-departing person at index 0', () => {
		const people = [
			makePerson({ id: 'p1', ets: addDays(TODAY, 120) }),
			makePerson({ id: 'p2', deros: addDays(TODAY, 10) })
		];
		const result = evaluateUpcomingLosses(people, WINDOW, TODAY);
		expect(result[0].personId).toBe('p2');
	});

	// -------------------------------------------------------------------------
	// Award-due signal
	// -------------------------------------------------------------------------

	it('sets awardDueSoon to true for all in-window entries', () => {
		const people = [
			makePerson({ id: 'p1', ets: addDays(TODAY, 45) }),
			makePerson({ id: 'p2', deros: addDays(TODAY, 90) })
		];
		const result = evaluateUpcomingLosses(people, WINDOW, TODAY);
		expect(result.every((r) => r.awardDueSoon === true)).toBe(true);
	});

	it('keeps the upcoming-loss entry but suppresses the award badge when tracking is acknowledged', () => {
		const people = [makePerson({ id: 'p1', ets: addDays(TODAY, 45) })];
		const [entry] = evaluateUpcomingLosses(people, WINDOW, TODAY, {
			awardTrackingAcknowledgedPersonnelIds: ['p1']
		});

		expect(entry.personId).toBe('p1');
		expect(entry.triggerType).toBe('ETS');
		expect(entry.awardDueSoon).toBe(false);
		expect(entry.awardTrackingAcknowledged).toBe(true);
	});

	// -------------------------------------------------------------------------
	// Result shape
	// -------------------------------------------------------------------------

	it('returns the correct personId, personName, and rank for each entry', () => {
		const person = makePerson({ id: 'abc', rank: 'CPT', lastName: 'Jones', ets: addDays(TODAY, 15) });
		const [entry] = evaluateUpcomingLosses([person], WINDOW, TODAY);

		expect(entry.id).toBe('abc');
		expect(entry.personId).toBe('abc');
		expect(entry.rank).toBe('CPT');
		expect(entry.lastName).toBe('Jones');
		expect(entry.personName).toBe('CPT Jones');
	});

	it('includes groupId from the personnel record', () => {
		const person = makePerson({ groupId: 'grp-1', ets: addDays(TODAY, 50) });
		const [entry] = evaluateUpcomingLosses([person], WINDOW, TODAY);
		expect(entry.groupId).toBe('grp-1');
	});

	it('sets groupId to null when personnel has no group', () => {
		const person = makePerson({ groupId: null, ets: addDays(TODAY, 50) });
		const [entry] = evaluateUpcomingLosses([person], WINDOW, TODAY);
		expect(entry.groupId).toBeNull();
	});

	// -------------------------------------------------------------------------
	// daysRemaining calculation
	// -------------------------------------------------------------------------

	it('calculates daysRemaining correctly', () => {
		const person = makePerson({ ets: addDays(TODAY, 45) });
		const [entry] = evaluateUpcomingLosses([person], WINDOW, TODAY);
		expect(entry.daysRemaining).toBe(45);
	});

	// -------------------------------------------------------------------------
	// Scope: personnel without dates don't contaminate the list
	// -------------------------------------------------------------------------

	it('only includes personnel with in-window dates even in a mixed list', () => {
		const people = [
			makePerson({ id: 'p1', ets: addDays(TODAY, 30) }), // in window
			makePerson({ id: 'p2', ets: null, deros: null }), // no dates
			makePerson({ id: 'p3', ets: addDays(TODAY, WINDOW + 5) }) // outside window
		];
		const result = evaluateUpcomingLosses(people, WINDOW, TODAY);
		expect(result).toHaveLength(1);
		expect(result[0].personId).toBe('p1');
	});
});
