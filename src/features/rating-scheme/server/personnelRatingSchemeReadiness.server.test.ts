import { describe, expect, it, vi } from 'vitest';
import type { Personnel } from '$features/personnel/contracts';
import { createTestContext } from './ratingSchemePersistence.test-support.server';
import { loadRatingSchemeReadinessLane } from './personnelRatingSchemeReadiness.server';

function row(id: string, end: string, overrides: Record<string, unknown> = {}) {
	return {
		id,
		organization_id: 'test-org',
		rated_person_id: 'person-1',
		rating_period_end: end,
		status: 'active',
		rater_person_id: null,
		rater_name: null,
		senior_rater_person_id: null,
		senior_rater_name: null,
		...overrides
	};
}

function readiness(rows: Record<string, unknown>[]) {
	const ctx = createTestContext();
	ctx.rawStore.seed('rating_scheme_entries', rows);
	return loadRatingSchemeReadinessLane({
		ratingScheme: ctx.ratingScheme,
		personnelId: 'person-1',
		loadAuthorizedPerson: async () => ({ id: 'person-1' }) as Personnel
	});
}

describe('Personnel Rating Scheme readiness', () => {
	it.each([
		['only completed', [row('done', '2026-12-31', { status: 'completed' })]],
		['another person', [row('other', '2026-12-31', { rated_person_id: 'other' })]],
		['another Organization', [row('foreign', '2026-12-31', { organization_id: 'foreign' })]],
		['no entries', []]
	])('reports not assigned for %s', async (_reason, rows) => {
		await expect(readiness(rows)).resolves.toMatchObject({ value: 'Not assigned', tone: 'bad' });
	});

	it('uses the newest noncompleted evaluation rather than an older aligned or newer completed entry', async () => {
		await expect(
			readiness([
				row('old', '2026-06-30', { rater_person_id: 'rater-1', senior_rater_name: 'External senior' }),
				row('new', '2026-12-31', { status: 'change-of-rater', rater_person_id: 'rater-2' }),
				row('done', '2027-06-30', { status: 'completed' })
			])
		).resolves.toMatchObject({ value: 'Senior rater needed', tone: 'watch' });
	});

	it.each([
		[{ rater_person_id: 'rater', senior_rater_person_id: 'senior' }, 'Aligned', 'info'],
		[{ rater_name: ' CPT Outside ', senior_rater_name: ' LTC Outside ' }, 'Aligned', 'info'],
		[{ rater_person_id: 'rater', senior_rater_name: 'LTC Outside' }, 'Aligned', 'info'],
		[{ rater_name: '   ', senior_rater_name: 'LTC Outside' }, 'Rater needed', 'watch'],
		[{ rater_person_id: 'rater', senior_rater_name: '   ' }, 'Senior rater needed', 'watch'],
		[{}, 'Rater needed', 'watch']
	])('handles internal, external and missing assignments %j', async (assignments, value, tone) => {
		await expect(readiness([row('entry', '2026-12-31', assignments)])).resolves.toMatchObject({ value, tone });
	});

	it('does not read evaluations when the delivery Person/Group authorization fails', async () => {
		const listPersonReadiness = vi.fn();
		const denial = Object.assign(new Error('out of scope'), { status: 403 });
		await expect(
			loadRatingSchemeReadinessLane({
				ratingScheme: { listPersonReadiness },
				personnelId: 'person-1',
				loadAuthorizedPerson: async () => {
					throw denial;
				}
			})
		).rejects.toBe(denial);
		expect(listPersonReadiness).not.toHaveBeenCalled();
	});

	it('propagates unavailable Rating data instead of showing an assignment result', async () => {
		await expect(
			loadRatingSchemeReadinessLane({
				ratingScheme: {
					listPersonReadiness: async () => {
						throw new Error('Rating unavailable');
					}
				},
				personnelId: 'person-1',
				loadAuthorizedPerson: async () => ({ id: 'person-1' }) as Personnel
			})
		).rejects.toThrow('Rating unavailable');
	});
});
