import { describe, it, expect } from 'vitest';
import { createQueryWithRawStorePortsContext, createInMemoryDataStore } from '$lib/server/adapters/inMemory';
import { fetchPersonnelBootstrap } from './personnelWorkspaceQuery';

const ORG = 'test-org';

function seedPersonnel(store: ReturnType<typeof createInMemoryDataStore>) {
	store.seed('personnel', [
		{
			id: 'p1',
			organization_id: ORG,
			rank: 'SGT',
			last_name: 'Smith',
			first_name: 'John',
			mos: '11B',
			clinic_role: 'Medic',
			group_id: 'g1',
			groups: { name: 'Alpha' }
		},
		{
			id: 'p2',
			organization_id: ORG,
			rank: 'CPT',
			last_name: 'Jones',
			first_name: 'Jane',
			mos: '68W',
			clinic_role: 'Provider',
			group_id: 'g2',
			groups: { name: 'Bravo' }
		}
	]);
	store.seed('groups', [
		{ id: 'g1', organization_id: ORG, name: 'Alpha', sort_order: 0 },
		{ id: 'g2', organization_id: ORG, name: 'Bravo', sort_order: 1 }
	]);
	store.seed('status_types', [
		{ id: 'st1', organization_id: ORG, name: 'Leave', color: '#000000', text_color: '#ffffff', sort_order: 0 },
		{ id: 'st2', organization_id: ORG, name: 'TDY', color: '#111111', text_color: '#eeeeee', sort_order: 1 }
	]);
	store.seed('user_pinned_groups', [
		{ id: 'pg1', organization_id: ORG, user_id: 'test-user', group_name: 'Alpha', sort_order: 0 }
	]);
	store.seed('rating_scheme_entries', [
		{
			id: 'rs1',
			organization_id: ORG,
			rated_person_id: 'p1',
			eval_type: 'NCOER',
			rater_person_id: null,
			rater_name: null,
			senior_rater_person_id: null,
			senior_rater_name: null,
			intermediate_rater_person_id: null,
			intermediate_rater_name: null,
			reviewer_person_id: null,
			reviewer_name: null,
			rating_period_start: '2024-01-01',
			rating_period_end: '2024-12-31',
			status: 'active',
			notes: null,
			report_type: 'AN',
			workflow_status: 'drafting'
		}
	]);
}

describe('fetchPersonnelBootstrap', () => {
	it('returns personnel and allPersonnel for an unscoped member', async () => {
		const ctx = createQueryWithRawStorePortsContext();
		seedPersonnel(ctx.store);

		const result = await fetchPersonnelBootstrap(ctx);

		expect(result.personnel).toHaveLength(2);
		expect(result.allPersonnel).toHaveLength(2);
		expect(result.personnel.map((p) => p.lastName)).toEqual(['Jones', 'Smith']);
		expect(result.allPersonnel.map((p) => p.lastName)).toEqual(['Jones', 'Smith']);
		expect(result.groups.map((g) => g.name)).toEqual(['Alpha', 'Bravo']);
		expect(result.statusTypes.map((s) => s.name)).toEqual(['Leave', 'TDY']);
		expect(result.pinnedGroups).toEqual(['Alpha']);
		expect(result.ratingSchemeEntries).toHaveLength(1);
	});

	it('excludes archived personnel from both arrays', async () => {
		const ctx = createQueryWithRawStorePortsContext();
		seedPersonnel(ctx.store);
		ctx.store.seed('personnel', [
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

		const result = await fetchPersonnelBootstrap(ctx);

		expect(result.personnel).toHaveLength(2);
		expect(result.allPersonnel).toHaveLength(2);
		expect(result.personnel.every((p) => p.id !== 'p-archived')).toBe(true);
		expect(result.allPersonnel.every((p) => p.id !== 'p-archived')).toBe(true);
	});

	it('scoped member sees only their group in personnel but full org in allPersonnel', async () => {
		const ctx = createQueryWithRawStorePortsContext({ auth: { scopedGroupId: 'g1' } });
		// Seed through rawStore — the scoped store filters from the same underlying data
		ctx.rawStore.seed('personnel', [
			{
				id: 'p1',
				organization_id: ORG,
				rank: 'SGT',
				last_name: 'Smith',
				first_name: 'John',
				mos: '11B',
				clinic_role: 'Medic',
				group_id: 'g1',
				groups: { name: 'Alpha' }
			},
			{
				id: 'p2',
				organization_id: ORG,
				rank: 'CPT',
				last_name: 'Jones',
				first_name: 'Jane',
				mos: '68W',
				clinic_role: 'Provider',
				group_id: 'g2',
				groups: { name: 'Bravo' }
			}
		]);
		ctx.rawStore.seed('groups', [
			{ id: 'g1', organization_id: ORG, name: 'Alpha', sort_order: 0 },
			{ id: 'g2', organization_id: ORG, name: 'Bravo', sort_order: 1 }
		]);
		ctx.rawStore.seed('status_types', [
			{ id: 'st1', organization_id: ORG, name: 'Leave', color: '#000000', text_color: '#ffffff', sort_order: 0 },
			{ id: 'st2', organization_id: ORG, name: 'TDY', color: '#111111', text_color: '#eeeeee', sort_order: 1 }
		]);
		ctx.rawStore.seed('user_pinned_groups', [
			{ id: 'pg1', organization_id: ORG, user_id: 'test-user', group_name: 'Alpha', sort_order: 0 }
		]);
		ctx.rawStore.seed('rating_scheme_entries', [
			{
				id: 'rs1',
				organization_id: ORG,
				rated_person_id: 'p1',
				eval_type: 'NCOER',
				rater_person_id: null,
				rater_name: null,
				senior_rater_person_id: null,
				senior_rater_name: null,
				intermediate_rater_person_id: null,
				intermediate_rater_name: null,
				reviewer_person_id: null,
				reviewer_name: null,
				rating_period_start: '2024-01-01',
				rating_period_end: '2024-12-31',
				status: 'active',
				notes: null,
				report_type: 'AN',
				workflow_status: 'drafting'
			}
		]);

		const result = await fetchPersonnelBootstrap(ctx);

		// Scoped store filters to g1 only
		expect(result.personnel).toHaveLength(1);
		expect(result.personnel[0].lastName).toBe('Smith');

		// Raw store returns all personnel
		expect(result.allPersonnel).toHaveLength(2);
		expect(result.groups.map((g) => g.name)).toEqual(['Alpha', 'Bravo']);
		expect(result.statusTypes.map((s) => s.name)).toEqual(['Leave', 'TDY']);
		expect(result.pinnedGroups).toEqual(['Alpha']);
		expect(result.ratingSchemeEntries).toHaveLength(1);
	});
});
