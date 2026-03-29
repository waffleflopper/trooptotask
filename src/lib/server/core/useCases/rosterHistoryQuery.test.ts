import { describe, it, expect, vi } from 'vitest';
import { createQueryPortsContext } from '$lib/server/adapters/inMemory';
import { fetchRosterHistory } from './rosterHistoryQuery';

const ORG = 'test-org';

function buildCtx() {
	return createQueryPortsContext();
}

describe('fetchRosterHistory', () => {
	it('calls requireView for calendar permission', async () => {
		const ctx = buildCtx();
		const spy = vi.spyOn(ctx.auth, 'requireView');

		await fetchRosterHistory(ctx);

		expect(spy).toHaveBeenCalledWith('calendar');
	});

	it('returns roster history with entity transforms', async () => {
		const ctx = buildCtx();
		ctx.store.seed('duty_roster_history', [
			{
				id: 'rh1',
				organization_id: ORG,
				assignment_type_id: 'at1',
				name: 'CQ Roster',
				start_date: '2026-03-01',
				end_date: '2026-03-31',
				roster: [],
				config: {},
				created_at: '2026-03-01T00:00:00Z'
			}
		]);

		const result = await fetchRosterHistory(ctx);

		expect(result).toHaveLength(1);
		expect(result[0]).toMatchObject({
			id: 'rh1',
			assignmentTypeId: 'at1',
			name: 'CQ Roster',
			startDate: '2026-03-01',
			endDate: '2026-03-31'
		});
	});

	it('limits roster history to 50 entries', async () => {
		const ctx = buildCtx();
		for (let i = 0; i < 55; i++) {
			ctx.store.seed('duty_roster_history', [
				{
					id: `rh-${i}`,
					organization_id: ORG,
					assignment_type_id: 'at1',
					name: `Roster ${i}`,
					start_date: '2026-03-01',
					end_date: '2026-03-31',
					roster: [],
					config: {},
					created_at: `2026-03-${String(i + 1).padStart(2, '0')}T00:00:00Z`
				}
			]);
		}

		const result = await fetchRosterHistory(ctx);

		expect(result).toHaveLength(50);
	});

	it('returns empty array when no roster history exists', async () => {
		const ctx = buildCtx();

		const result = await fetchRosterHistory(ctx);

		expect(result).toEqual([]);
	});
});
