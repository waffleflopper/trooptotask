import { describe, expect, it } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import {
	listAvailabilityEntries,
	listAvailabilityExportRows,
	listPersonnelAvailabilityHistory
} from './availabilityRead.server';

describe('Calendar availability reads', () => {
	it('returns only the selected Person’s current entries, earliest end first for readiness', async () => {
		const ctx = createTestContext();
		ctx.store.seed('availability_entries', [
			{
				id: 'long',
				organization_id: ctx.auth.orgId,
				personnel_id: 'person-1',
				status_type_id: 'status-1',
				start_date: '2026-09-25',
				end_date: '2026-09-30'
			},
			{
				id: 'soon',
				organization_id: ctx.auth.orgId,
				personnel_id: 'person-1',
				status_type_id: 'status-1',
				start_date: '2026-09-26',
				end_date: '2026-09-27'
			},
			{
				id: 'other-person',
				organization_id: ctx.auth.orgId,
				personnel_id: 'person-2',
				status_type_id: 'status-1',
				start_date: '2026-09-27',
				end_date: '2026-09-27'
			},
			{
				id: 'past',
				organization_id: ctx.auth.orgId,
				personnel_id: 'person-1',
				status_type_id: 'status-1',
				start_date: '2026-09-20',
				end_date: '2026-09-22'
			}
		]);

		const entries = await listAvailabilityEntries(ctx, {
			personnelId: 'person-1',
			rangeStart: '2026-09-27',
			rangeEnd: '2026-09-27',
			orderByEndDate: true
		});
		expect(entries.map((entry) => entry.id)).toEqual(['soon', 'long']);
	});

	it('preserves all saved history for one Person in newest-start order', async () => {
		const ctx = createTestContext();
		ctx.rawStore.seed('availability_entries', [
			{
				id: 'older',
				organization_id: ctx.auth.orgId,
				personnel_id: 'person-1',
				status_type_id: 'status-1',
				start_date: '2025-12-01',
				end_date: '2025-12-03'
			},
			{
				id: 'newer',
				organization_id: ctx.auth.orgId,
				personnel_id: 'person-1',
				status_type_id: 'status-1',
				start_date: '2026-05-15',
				end_date: '2026-05-17'
			},
			{
				id: 'another-person',
				organization_id: ctx.auth.orgId,
				personnel_id: 'person-2',
				status_type_id: 'status-1',
				start_date: '2026-06-01',
				end_date: '2026-06-03'
			}
		]);
		const entries = await listPersonnelAvailabilityHistory(ctx, 'person-1');
		expect(entries.map((entry) => entry.id)).toEqual(['newer', 'older']);
	});

	it('exports complete saved rows for the selected Organization, including history and raw fields', async () => {
		const ctx = createTestContext();
		const own = {
			id: 'old-leave',
			organization_id: ctx.auth.orgId,
			personnel_id: 'person-1',
			status_type_id: 'status-1',
			start_date: '2025-12-01',
			end_date: '2025-12-03',
			created_at: '2025-11-30T10:00:00Z',
			note: 'Saved note'
		};
		ctx.store.seed('availability_entries', [own, { ...own, id: 'foreign', organization_id: 'another-organization' }]);
		expect(await listAvailabilityExportRows(ctx.store, ctx.auth.orgId)).toEqual([own]);
	});
});
