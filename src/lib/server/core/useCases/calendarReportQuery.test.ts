import { describe, it, expect } from 'vitest';
import { createInMemoryDataStore, createQueryWithRawStorePortsContext } from '$lib/server/adapters/inMemory';
import { fetchCalendarReportData } from './calendarReportQuery';

const ORG = 'test-org';

function buildCtx() {
	return createQueryWithRawStorePortsContext();
}

function seedData(store: ReturnType<typeof createInMemoryDataStore>) {
	store.seed('personnel', [
		{
			id: 'p1',
			organization_id: ORG,
			rank: 'SGT',
			last_name: 'Smith',
			first_name: 'John',
			mos: '11B',
			clinic_role: '',
			group_id: 'g1',
			groups: { name: 'Alpha' }
		},
		{
			id: 'p2',
			organization_id: ORG,
			rank: 'CPL',
			last_name: 'Jones',
			first_name: 'Jane',
			mos: '68W',
			clinic_role: '',
			group_id: 'g2',
			groups: { name: 'Bravo' }
		},
		{
			id: 'p-archived',
			organization_id: ORG,
			rank: 'PVT',
			last_name: 'Gone',
			first_name: 'Long',
			mos: '11B',
			clinic_role: '',
			group_id: 'g1',
			groups: { name: 'Alpha' },
			archived_at: '2026-01-01T00:00:00Z'
		}
	]);
	store.seed('groups', [
		{ id: 'g1', organization_id: ORG, name: 'Alpha', sort_order: 0 },
		{ id: 'g2', organization_id: ORG, name: 'Bravo', sort_order: 1 }
	]);
	store.seed('status_types', [
		{ id: 'st1', organization_id: ORG, name: 'Leave', color: '#ff0', text_color: '#000', sort_order: 0 }
	]);
}

describe('fetchCalendarReportData', () => {
	it('returns allPersonnel (unscoped, no archived), statusTypes, and groups', async () => {
		const ctx = buildCtx();
		seedData(ctx.store);

		const result = await fetchCalendarReportData(ctx);

		expect(result.allPersonnel).toHaveLength(2);
		expect(result.allPersonnel.every((p) => !p.archivedAt)).toBe(true);
		expect(result.statusTypes).toHaveLength(1);
		expect(result.statusTypes[0].name).toBe('Leave');
		expect(result.groups).toHaveLength(2);
		expect(result.groups[0].name).toBe('Alpha');
	});

	it('excludes archived personnel', async () => {
		const ctx = buildCtx();
		seedData(ctx.store);

		const result = await fetchCalendarReportData(ctx);

		expect(result.allPersonnel.find((p) => p.id === 'p-archived')).toBeUndefined();
	});

	it('uses rawStore (unscoped) for personnel', async () => {
		const ctx = buildCtx();
		// Only seed into rawStore to confirm it reads from there
		seedData(ctx.rawStore as ReturnType<typeof createInMemoryDataStore>);

		const result = await fetchCalendarReportData(ctx);

		expect(result.allPersonnel).toHaveLength(2);
	});
});
