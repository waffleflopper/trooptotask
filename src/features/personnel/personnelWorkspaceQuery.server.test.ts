import { describe, it, expect } from 'vitest';
import { createQueryWithRawStorePortsContext, createInMemoryDataStore } from '$lib/server/adapters/inMemory';
import { loadPersonnelWorkspace, type PersonnelWorkspaceSources } from './personnelWorkspaceQuery.server';
import { createCapabilityMap, type ScopeSet } from '$lib/access/memberAccessShape';

function sourcesFor(ctx: ReturnType<typeof createQueryWithRawStorePortsContext>): PersonnelWorkspaceSources {
	return {
		listStatusTypes: async (orgId) =>
			orgId === ORG
				? [
						{ id: 'st1', name: 'Leave', color: '#000000', textColor: '#ffffff' },
						{ id: 'st2', name: 'TDY', color: '#111111', textColor: '#eeeeee' }
					]
				: [{ id: 'foreign-status', name: 'Foreign', color: '#000000', textColor: '#ffffff' }],
		loadLossWarningWindowDays: async (orgId) =>
			(await ctx.organizationSettings.findLossWarningWindowDays(orgId)) ?? null
	};
}

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
	store.seed('organization_rank_catalog', [
		{
			id: 'rank-sgt',
			organization_id: ORG,
			code: 'SGT',
			label: 'Sergeant',
			service: 'army',
			category: 'enlisted',
			pay_grade: 'E-5',
			state: 'active',
			source: 'built-in',
			sort_order: 0
		},
		{
			id: 'rank-po3',
			organization_id: ORG,
			code: 'PO3',
			label: 'Petty Officer Third Class',
			service: 'navy',
			category: 'enlisted',
			pay_grade: 'E-4',
			state: 'active',
			source: 'built-in',
			sort_order: 1
		}
	]);
	store.seed('user_pinned_groups', [
		{ id: 'pg1', organization_id: ORG, user_id: 'test-user', group_name: 'Alpha', sort_order: 0 }
	]);
}

describe('loadPersonnelWorkspace', () => {
	it('returns the full same-Organization Group catalog in saved order to an Organization-wide member', async () => {
		const ctx = createQueryWithRawStorePortsContext({
			auth: { role: 'member', isPrivileged: false, scopeSet: { kind: 'organization' } }
		});
		seedPersonnel(ctx.store);
		ctx.store.seed('groups', [
			{ id: 'g0', organization_id: ORG, name: 'Earlier', sort_order: -1 },
			{ id: 'foreign', organization_id: 'other-org', name: 'Foreign', sort_order: -2 }
		]);

		const result = (await loadPersonnelWorkspace(ctx, sourcesFor(ctx))).data;

		expect(result.groups.map((group) => group.name)).toEqual(['Earlier', 'Alpha', 'Bravo']);
	});

	it("returns only the Groups and pinned names in a Group-scoped member's scope", async () => {
		const ctx = createQueryWithRawStorePortsContext({ auth: { scopeSet: { kind: 'groups', groupIds: ['g1'] } } });
		seedPersonnel(ctx.store);
		ctx.store.seed('groups', [{ id: 'g0', organization_id: ORG, name: 'Earlier', sort_order: -1 }]);
		ctx.store.seed('user_pinned_groups', [
			{ id: 'pg2', organization_id: ORG, user_id: 'test-user', group_name: 'Bravo', sort_order: 1 },
			{ id: 'pg3', organization_id: ORG, user_id: 'test-user', group_name: 'Earlier', sort_order: 2 }
		]);

		const { data, hydration } = await loadPersonnelWorkspace(ctx, sourcesFor(ctx));

		expect(data.groups).toEqual([{ id: 'g1', name: 'Alpha', sortOrder: 0 }]);
		expect(hydration.groups.items).toEqual([{ id: 'g1', name: 'Alpha', sortOrder: 0 }]);
		expect(data.pinnedGroups).toEqual(['Alpha']);
		expect(hydration.pinnedGroups.items).toEqual(['Alpha']);
		expect(data.personnel.map((person) => person.id)).toEqual(['p1']);
	});

	it('returns no Groups or pinned names to an empty Group scope', async () => {
		const ctx = createQueryWithRawStorePortsContext({ auth: { scopeSet: { kind: 'groups', groupIds: [] } } });
		seedPersonnel(ctx.store);

		const result = (await loadPersonnelWorkspace(ctx, sourcesFor(ctx))).data;

		expect([result.groups, result.pinnedGroups, result.personnel]).toEqual([[], [], []]);
	});

	it('drops a stale pin that names no current Group', async () => {
		const ctx = createQueryWithRawStorePortsContext();
		seedPersonnel(ctx.store);
		ctx.store.seed('user_pinned_groups', [
			{ id: 'pg2', organization_id: ORG, user_id: 'test-user', group_name: 'Deleted', sort_order: 1 },
			{ id: 'pg3', organization_id: ORG, user_id: 'test-user', group_name: 'Bravo', sort_order: 2 }
		]);

		const result = (await loadPersonnelWorkspace(ctx, sourcesFor(ctx))).data;

		expect(result.pinnedGroups).toEqual(['Alpha', 'Bravo']);
	});

	it('returns scoped personnel plus a minimal lookup projection for an unscoped member', async () => {
		const ctx = createQueryWithRawStorePortsContext();
		seedPersonnel(ctx.store);

		const result = (await loadPersonnelWorkspace(ctx, sourcesFor(ctx))).data;

		expect(result.personnel).toHaveLength(2);
		expect(result.personnel.map((p) => p.lastName)).toEqual(['Jones', 'Smith']);
		expect(result.personnelLookup).toEqual([
			{ id: 'p2', rank: 'CPT', lastName: 'Jones', firstName: 'Jane' },
			{ id: 'p1', rank: 'SGT', lastName: 'Smith', firstName: 'John' }
		]);
		expect(result).not.toHaveProperty('allPersonnel');
		expect(result.groups.map((g) => g.name)).toEqual(['Alpha', 'Bravo']);
		expect(result.statusTypes.map((s) => s.name)).toEqual(['Leave', 'TDY']);
		expect(result.rankCatalog).toEqual([
			expect.objectContaining({ code: 'SGT', label: 'Sergeant', state: 'active' }),
			expect.objectContaining({ code: 'PO3', label: 'Petty Officer Third Class', state: 'active' })
		]);
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

		const result = (await loadPersonnelWorkspace(ctx, sourcesFor(ctx))).data;

		expect(result.personnel).toHaveLength(2);
		expect(result.personnel.every((p) => p.id !== 'p-archived')).toBe(true);
		expect(result.personnelLookup.every((p) => p.id !== 'p-archived')).toBe(true);
	});

	it('scoped member receives only scoped records in the lookup projection', async () => {
		const ctx = createQueryWithRawStorePortsContext({ auth: { scopeSet: { kind: 'groups', groupIds: ['g1'] } } });
		seedPersonnel(ctx.rawStore);

		const result = (await loadPersonnelWorkspace(ctx, sourcesFor(ctx))).data;

		expect(result.personnel).toHaveLength(1);
		expect(result.personnel[0].lastName).toBe('Smith');

		expect(result.personnelLookup).toEqual([{ id: 'p1', rank: 'SGT', lastName: 'Smith', firstName: 'John' }]);
		expect(result).not.toHaveProperty('allPersonnel');
		expect(result.groups.map((g) => g.name)).toEqual(['Alpha']);
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
		seedPersonnel(ctx.rawStore);
		ctx.rawStore.seed('personnel', [
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

		const result = (await loadPersonnelWorkspace(ctx, sourcesFor(ctx))).data;

		expect(result.personnel.map((person) => person.id)).toEqual(['p3', 'p1']);
		expect(result.personnelLookup.map((person) => person.id)).toEqual(['p3', 'p1']);
	});
});

describe('loadPersonnelWorkspace roster reads', () => {
	it.each<[string, ScopeSet, string[]]>([
		['an Organization-wide', { kind: 'organization' }, ['p2', 'p1']],
		['a Group-scoped', { kind: 'groups', groupIds: ['g1'] }, ['p1']]
	])(
		'reads the active roster once for %s member and serves the roster and lookup from it',
		async (_, scopeSet, ids) => {
			const ctx = createQueryWithRawStorePortsContext({ auth: { scopeSet } });
			seedPersonnel(ctx.rawStore);
			let activeRosterReads = 0;
			const read = ctx.store.findMany.bind(ctx.store);
			ctx.store.findMany = async (table, orgId, filters, options) => {
				if (table === 'personnel' && options?.isNull?.archived_at === true) activeRosterReads += 1;
				return read(table, orgId, filters, options);
			};

			const { data } = await loadPersonnelWorkspace(ctx, sourcesFor(ctx));

			expect(activeRosterReads).toBe(1);
			expect(data.personnel.map((person) => person.id)).toEqual(ids);
			expect(data.personnelLookup.map((person) => person.id)).toEqual(ids);
		}
	);
});

describe('loadPersonnelWorkspace — loss warning window', () => {
	it('returns the configured loss warning window from the organizations row', async () => {
		const ctx = createQueryWithRawStorePortsContext();
		ctx.store.seed('organizations', [{ id: 'test-org', loss_warning_window_days: 90 }]);

		const result = (await loadPersonnelWorkspace(ctx, sourcesFor(ctx))).data;

		expect(result.lossWarningWindowDays).toBe(90);
	});

	it('defaults the loss warning window to 180 when the organizations row is missing the value', async () => {
		const ctx = createQueryWithRawStorePortsContext();

		const result = (await loadPersonnelWorkspace(ctx, sourcesFor(ctx))).data;

		expect(result.lossWarningWindowDays).toBe(180);
	});

	it('returns personnel IDs with acknowledged award tracking from personnel_extended_info', async () => {
		const ctx = createQueryWithRawStorePortsContext();
		seedPersonnel(ctx.store);
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

		const result = (await loadPersonnelWorkspace(ctx, sourcesFor(ctx))).data;

		expect(result.awardTrackingAcknowledgedPersonnelIds).toEqual(['p1']);
	});
});

describe('Personnel workspace isolation and failures', () => {
	it('keeps an explicit empty scope empty, including Groups and pins, while retaining Organization catalogs', async () => {
		const ctx = createQueryWithRawStorePortsContext({
			auth: { scopeSet: { kind: 'groups', groupIds: [] } }
		});
		seedPersonnel(ctx.rawStore);
		ctx.rawStore.seed('personnel_extended_info', [
			{ id: 'ack-1', organization_id: ORG, personnel_id: 'p1', award_tracking_acknowledged_at: '2026-01-01' }
		]);

		const { data } = await loadPersonnelWorkspace(ctx, sourcesFor(ctx));

		expect(data.personnel).toEqual([]);
		expect(data.personnelLookup).toEqual([]);
		expect(data.awardTrackingAcknowledgedPersonnelIds).toEqual([]);
		expect(data.groups).toEqual([]);
		expect(data.rankCatalog.map((rank) => rank.code)).toEqual(['SGT', 'PO3']);
		expect(data.pinnedGroups).toEqual([]);
	});

	it('does not expose foreign people, catalogs, acknowledgements or another member’s pins', async () => {
		const ctx = createQueryWithRawStorePortsContext();
		seedPersonnel(ctx.rawStore);
		ctx.rawStore.seed('personnel', [
			{ id: 'foreign-person', organization_id: 'other-org', first_name: 'Foreign', last_name: 'Person' }
		]);
		ctx.rawStore.seed('groups', [{ id: 'foreign-group', organization_id: 'other-org', name: 'Foreign' }]);
		ctx.rawStore.seed('organization_rank_catalog', [
			{ id: 'foreign-rank', organization_id: 'other-org', code: 'FOREIGN', state: 'active' }
		]);
		ctx.rawStore.seed('user_pinned_groups', [
			{ id: 'peer-pin', organization_id: ORG, user_id: 'other-user', group_name: 'Bravo', sort_order: 0 },
			{ id: 'foreign-pin', organization_id: 'other-org', user_id: 'test-user', group_name: 'Foreign', sort_order: 0 }
		]);
		ctx.rawStore.seed('personnel_extended_info', [
			{ id: 'own-ack', organization_id: ORG, personnel_id: 'p1', award_tracking_acknowledged_at: '2026-01-01' },
			{
				id: 'foreign-ack',
				organization_id: 'other-org',
				personnel_id: 'foreign-person',
				award_tracking_acknowledged_at: '2026-01-01'
			}
		]);

		const { data } = await loadPersonnelWorkspace(ctx, sourcesFor(ctx));

		expect(data.personnel.map((person) => person.id)).toEqual(['p2', 'p1']);
		expect(data.personnelLookup.map((person) => person.id)).toEqual(['p2', 'p1']);
		expect(data.groups.map((group) => group.name)).toEqual(['Alpha', 'Bravo']);
		expect(data.statusTypes.map((status) => status.id)).toEqual(['st1', 'st2']);
		expect(data.rankCatalog.map((rank) => rank.code)).toEqual(['SGT', 'PO3']);
		expect(data.pinnedGroups).toEqual(['Alpha']);
		expect(data.awardTrackingAcknowledgedPersonnelIds).toEqual(['p1']);
	});

	it('denies a member without Personnel before reading sources even when Calendar is configured', async () => {
		const ctx = createQueryWithRawStorePortsContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: { ...createCapabilityMap('none'), calendar: 'configure' }
			}
		});
		const reads: string[] = [];
		ctx.store.findMany = async (table) => {
			reads.push(table);
			throw new Error('Unexpected read');
		};
		const forbiddenSources: PersonnelWorkspaceSources = {
			listStatusTypes: async () => {
				reads.push('Calendar');
				throw new Error('Unexpected read');
			},
			loadLossWarningWindowDays: async () => {
				reads.push('settings');
				throw new Error('Unexpected read');
			}
		};

		await expect(loadPersonnelWorkspace(ctx, forbiddenSources)).rejects.toMatchObject({ status: 403 });
		expect(reads).toEqual([]);
	});

	it.each(['personnel', 'groups', 'organization_rank_catalog', 'user_pinned_groups'])(
		'rejects the workspace when the required %s source fails',
		async (failedTable) => {
			const ctx = createQueryWithRawStorePortsContext();
			seedPersonnel(ctx.store);
			const read = ctx.store.findMany.bind(ctx.store);
			ctx.store.findMany = async (table, ...args) => {
				if (table === failedTable) throw new Error(`Unavailable ${failedTable}`);
				return read(table, ...args);
			};

			await expect(loadPersonnelWorkspace(ctx, sourcesFor(ctx))).rejects.toThrow(`Unavailable ${failedTable}`);
		}
	);

	it('rejects when the required Calendar snapshot source fails', async () => {
		const ctx = createQueryWithRawStorePortsContext();
		seedPersonnel(ctx.store);
		await expect(
			loadPersonnelWorkspace(ctx, {
				...sourcesFor(ctx),
				listStatusTypes: async () => {
					throw new Error('Unavailable Calendar snapshots');
				}
			})
		).rejects.toThrow('Unavailable Calendar snapshots');
	});

	it('rejects when award acknowledgement facts cannot be read', async () => {
		const ctx = createQueryWithRawStorePortsContext();
		seedPersonnel(ctx.store);
		ctx.personnelAwardAcknowledgement = {
			listAcknowledgedPersonnelIds: async () => {
				throw new Error('Unavailable acknowledgements');
			}
		};

		await expect(loadPersonnelWorkspace(ctx, sourcesFor(ctx))).rejects.toThrow('Unavailable acknowledgements');
	});

	it('retains roster facts and reports the loss warning window unavailable when settings fail', async () => {
		const ctx = createQueryWithRawStorePortsContext();
		seedPersonnel(ctx.store);
		const { data } = await loadPersonnelWorkspace(ctx, {
			...sourcesFor(ctx),
			loadLossWarningWindowDays: async () => {
				throw new Error('Unavailable settings');
			}
		});

		expect(data.personnel.map((person) => person.id)).toEqual(['p2', 'p1']);
		expect(data.lossWarningWindowDays).toBeNull();
	});

	it.each([
		[60, 60],
		[undefined, 180]
	] as const)('keeps a stored warning window of %s as %s', async (stored, expected) => {
		const ctx = createQueryWithRawStorePortsContext();
		seedPersonnel(ctx.store);
		const { data } = await loadPersonnelWorkspace(ctx, {
			...sourcesFor(ctx),
			loadLossWarningWindowDays: async () => stored
		});

		expect(data.lossWarningWindowDays).toBe(expected);
	});

	it('produces usable hydration targets with the trusted Organization and opaque snapshot keys', async () => {
		const ctx = createQueryWithRawStorePortsContext();
		seedPersonnel(ctx.store);
		const { hydration } = await loadPersonnelWorkspace(ctx, sourcesFor(ctx));

		expect(hydration.orgId).toBe(ORG);
		expect((await hydration.personnel.items).map((person) => person.id)).toEqual(['p2', 'p1']);
		expect((await hydration.groups.items).map((group) => group.name)).toEqual(['Alpha', 'Bravo']);
		expect((await hydration.statusTypes.items).map((status) => status.id)).toEqual(['st1', 'st2']);
		expect(await hydration.pinnedGroups.items).toEqual(['Alpha']);
		for (const target of [hydration.personnel, hydration.groups, hydration.statusTypes, hydration.pinnedGroups]) {
			expect(target.mode).toBe('replace');
			expect(target.snapshotKey).toMatch(/^resolved:/);
			expect(target.snapshotKey).not.toContain('Smith');
			expect(target.snapshotKey).not.toContain('Alpha');
		}
	});
});
