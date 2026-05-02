import { describe, it, expect, vi } from 'vitest';
import { createQueryWithRawStorePortsContext, createInMemoryDataStore } from '$lib/server/adapters/inMemory';
import { fetchPersonnelBootstrap, fetchRatingSchemeBootstrap } from './personnelWorkspaceQuery';

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
	it('returns scoped personnel plus a minimal lookup projection for an unscoped member', async () => {
		const ctx = createQueryWithRawStorePortsContext();
		seedPersonnel(ctx.store);

		const result = await fetchPersonnelBootstrap(ctx);

		expect(result.personnel).toHaveLength(2);
		expect(result.personnel.map((p) => p.lastName)).toEqual(['Jones', 'Smith']);
		expect(result.personnelLookup).toEqual([
			{ id: 'p2', rank: 'CPT', lastName: 'Jones', firstName: 'Jane' },
			{ id: 'p1', rank: 'SGT', lastName: 'Smith', firstName: 'John' }
		]);
		expect(result).not.toHaveProperty('allPersonnel');
		expect(result.groups.map((g) => g.name)).toEqual(['Alpha', 'Bravo']);
		expect(result.statusTypes.map((s) => s.name)).toEqual(['Leave', 'TDY']);
		expect(result.pinnedGroups).toEqual(['Alpha']);
		expect(result).not.toHaveProperty('ratingSchemeEntries');
		expect(result.awardTrackingAcknowledgedPersonnelIds).toEqual([]);
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
		expect(result.personnel.every((p) => p.id !== 'p-archived')).toBe(true);
		expect(result.personnelLookup.every((p) => p.id !== 'p-archived')).toBe(true);
	});

	it('scoped member receives only scoped records in the lookup projection', async () => {
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

		// The lookup path should not overexpose off-scope personnel either
		expect(result.personnelLookup).toEqual([{ id: 'p1', rank: 'SGT', lastName: 'Smith', firstName: 'John' }]);
		expect(result).not.toHaveProperty('allPersonnel');
		expect(result.groups.map((g) => g.name)).toEqual(['Alpha', 'Bravo']);
		expect(result.statusTypes.map((s) => s.name)).toEqual(['Leave', 'TDY']);
		expect(result.pinnedGroups).toEqual(['Alpha']);
		expect(result).not.toHaveProperty('ratingSchemeEntries');
		expect(result.awardTrackingAcknowledgedPersonnelIds).toEqual([]);
	});

	it('limits roster hydration to the member multi-Group scope set', async () => {
		const ctx = createQueryWithRawStorePortsContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'none',
					personnel: 'view',
					training: 'none',
					criticalTasks: 'none',
					onboarding: 'none',
					ratingScheme: 'none'
				},
				scopeSet: { kind: 'groups', groupIds: ['g1', 'g3'] }
			}
		});
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
			},
			{
				id: 'p3',
				organization_id: ORG,
				rank: 'SSG',
				last_name: 'Davis',
				first_name: 'Kai',
				mos: '25B',
				clinic_role: 'Signal',
				group_id: 'g3',
				groups: { name: 'Charlie' }
			}
		]);

		const result = await fetchPersonnelBootstrap(ctx);

		expect(result.personnel.map((person) => person.id)).toEqual(['p3', 'p1']);
		expect(result.personnelLookup.map((person) => person.id)).toEqual(['p3', 'p1']);
	});
});

describe('fetchPersonnelBootstrap — loss warning window', () => {
	it('returns the configured loss warning window from the organizations row', async () => {
		const ctx = createQueryWithRawStorePortsContext();
		ctx.store.seed('organizations', [{ id: 'test-org', loss_warning_window_days: 90 }]);

		const result = await fetchPersonnelBootstrap(ctx);

		expect(result.lossWarningWindowDays).toBe(90);
	});

	it('defaults the loss warning window to 180 when the organizations row is missing the value', async () => {
		const ctx = createQueryWithRawStorePortsContext();

		const result = await fetchPersonnelBootstrap(ctx);

		expect(result.lossWarningWindowDays).toBe(180);
	});

	it('returns personnel IDs with acknowledged award tracking from personnel_extended_info', async () => {
		const ctx = createQueryWithRawStorePortsContext();
		ctx.store.seed('personnel_extended_info', [
			{
				id: 'pei-1',
				organization_id: ORG,
				personnel_id: 'p1',
				award_tracking_acknowledged_at: '2026-04-14T00:00:00Z'
			},
			{
				id: 'pei-2',
				organization_id: ORG,
				personnel_id: 'p2',
				award_tracking_acknowledged_at: null
			}
		]);

		const result = await fetchPersonnelBootstrap(ctx);

		expect(result.awardTrackingAcknowledgedPersonnelIds).toEqual(['p1']);
	});
});

describe('fetchRatingSchemeBootstrap', () => {
	it('returns rating-scheme data with personnel lookup but without roster hydration data', async () => {
		const ctx = createQueryWithRawStorePortsContext();
		seedPersonnel(ctx.store);
		ctx.store.seed('organizations', [{ id: ORG, loss_warning_window_days: 120 }]);
		ctx.store.seed('personnel_extended_info', [
			{
				id: 'pei-1',
				organization_id: ORG,
				personnel_id: 'p1',
				award_tracking_acknowledged_at: '2026-04-14T00:00:00Z'
			}
		]);
		ctx.ratingSchemePersonnelLookup = {
			listPersonnelLookup: vi.fn().mockResolvedValue([
				{ id: 'p2', rank: 'CPT', lastName: 'Jones', firstName: 'Jane' },
				{ id: 'p1', rank: 'SGT', lastName: 'Smith', firstName: 'John' }
			])
		};

		const result = await fetchRatingSchemeBootstrap(ctx);

		expect(result).not.toHaveProperty('personnel');
		expect(result.personnelLookup).toEqual([
			{ id: 'p2', rank: 'CPT', lastName: 'Jones', firstName: 'Jane' },
			{ id: 'p1', rank: 'SGT', lastName: 'Smith', firstName: 'John' }
		]);
		expect(result).not.toHaveProperty('groups');
		expect(result).not.toHaveProperty('statusTypes');
		expect(result).not.toHaveProperty('pinnedGroups');
		expect(result.ratingSchemeEntries).toHaveLength(1);
		expect(result.lossWarningWindowDays).toBe(120);
		expect(result).not.toHaveProperty('awardTrackingAcknowledgedPersonnelIds');
	});

	it('keeps roster reference lookup scoped to the member group', async () => {
		const ctx = createQueryWithRawStorePortsContext({ auth: { scopedGroupId: 'g1' } });
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
		ctx.ratingSchemePersonnelLookup = {
			listPersonnelLookup: vi.fn().mockResolvedValue([{ id: 'p1', rank: 'SGT', lastName: 'Smith', firstName: 'John' }])
		};

		const result = await fetchRatingSchemeBootstrap(ctx);

		expect(result).not.toHaveProperty('personnel');
		expect(result.personnelLookup).toEqual([{ id: 'p1', rank: 'SGT', lastName: 'Smith', firstName: 'John' }]);
		expect(result.ratingSchemeEntries).toHaveLength(1);
	});

	it('uses the dedicated rating-scheme personnel lookup port when available', async () => {
		const ctx = createQueryWithRawStorePortsContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'none',
					personnel: 'none',
					training: 'none',
					criticalTasks: 'none',
					onboarding: 'none',
					ratingScheme: 'view'
				}
			}
		});
		ctx.store.seed('personnel', [
			{
				id: 'p1',
				organization_id: ORG,
				rank: 'SGT',
				last_name: 'Smith',
				first_name: 'John',
				mos: '11B',
				clinic_role: 'Medic',
				group_id: 'g1'
			}
		]);
		const listPersonnelLookup = vi
			.fn()
			.mockResolvedValue([{ id: 'p2', rank: 'CPT', lastName: 'Jones', firstName: 'Jane' }]);
		ctx.ratingSchemePersonnelLookup = { listPersonnelLookup };

		const result = await fetchRatingSchemeBootstrap(ctx);

		expect(listPersonnelLookup).toHaveBeenCalledWith(ORG);
		expect(result.personnelLookup).toEqual([{ id: 'p2', rank: 'CPT', lastName: 'Jones', firstName: 'Jane' }]);
	});

	it('does not allow adjacent roster reference reads through Personnel capability alone', async () => {
		const ctx = createQueryWithRawStorePortsContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'none',
					personnel: 'view',
					training: 'none',
					criticalTasks: 'none',
					onboarding: 'none',
					ratingScheme: 'none'
				}
			}
		});
		ctx.ratingSchemePersonnelLookup = { listPersonnelLookup: vi.fn().mockResolvedValue([]) };

		await expect(fetchRatingSchemeBootstrap(ctx)).rejects.toMatchObject({ status: 403 });
	});

	it('requires the dedicated rating-scheme personnel lookup port', async () => {
		const ctx = createQueryWithRawStorePortsContext();

		await expect(fetchRatingSchemeBootstrap(ctx)).rejects.toThrow('Rating Scheme personnel lookup port is required');
	});
});
