import { describe, expect, it, vi } from 'vitest';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import type { SignInRosterPersonnelLookupRecord } from '$lib/server/core/ports';
import { _getConfig, _postConfig } from './+server';

const GROUP_ALPHA = 'group-alpha';
const GROUP_BRAVO = 'group-bravo';

function seedPersonnel(ctx: ReturnType<typeof createTestContext>) {
	ctx.rawStore.seed('groups', [
		{ id: GROUP_ALPHA, organization_id: ctx.auth.orgId, name: 'Alpha' },
		{ id: GROUP_BRAVO, organization_id: ctx.auth.orgId, name: 'Bravo' }
	]);
	ctx.rawStore.seed('personnel', [
		{
			id: 'p-alpha',
			organization_id: ctx.auth.orgId,
			rank: 'SGT',
			last_name: 'Smith',
			first_name: 'Jane',
			group_id: GROUP_ALPHA
		},
		{
			id: 'p-bravo',
			organization_id: ctx.auth.orgId,
			rank: 'SSG',
			last_name: 'Jones',
			first_name: 'Avery',
			group_id: GROUP_BRAVO
		}
	]);
}

describe('/api/sign-in-rosters route config', () => {
	it('creates and reloads an independent sign-in roster with Calendar denied and no duty records', async () => {
		const ctx = createTestContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				scopeSet: { kind: 'groups', groupIds: [GROUP_ALPHA] },
				capabilityMap: {
					calendar: 'none',
					personnel: 'none',
					training: 'operate',
					criticalTasks: 'none',
					onboarding: 'none',
					ratingScheme: 'none'
				}
			}
		});
		seedPersonnel(ctx);
		ctx.signInRosterPersonnelLookup = {
			findPersonnelForRosterSnapshot: async () => [
				{
					id: 'p-alpha',
					rank: 'SGT',
					last_name: 'Smith',
					first_name: 'Jane',
					group_id: GROUP_ALPHA,
					group_name: 'Alpha'
				}
			]
		};
		const created = (await handleUseCaseRequest(_postConfig, ctx, {
			title: 'Independent training attendance',
			rosterDate: '2026-03-15',
			personnelIds: ['p-alpha']
		})) as Record<string, unknown>;
		const result = await handleUseCaseRequest(_getConfig, ctx, { limit: 20, offset: 0 });
		expect(result).toEqual({
			total: 1,
			rosters: [
				expect.objectContaining({
					id: created.id,
					title: 'Independent training attendance',
					rosterDate: '2026-03-15',
					personnelSnapshot: [
						{ id: 'p-alpha', rank: 'SGT', lastName: 'Smith', firstName: 'Jane', group: 'Alpha', groupId: GROUP_ALPHA }
					]
				})
			]
		});
		expect(await ctx.rawStore.findMany('daily_assignments', ctx.auth.orgId)).toEqual([]);
		expect(ctx.auditPort.events).toEqual([
			expect.objectContaining({ action: 'sign_in_roster.created', resourceId: created.id })
		]);
	});

	it('looks up only missing same-Organization Group labels and leaves unknown labels blank', async () => {
		const ctx = createTestContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				scopeSet: { kind: 'organization' },
				capabilityMap: {
					calendar: 'none',
					personnel: 'none',
					training: 'operate',
					criticalTasks: 'none',
					onboarding: 'none',
					ratingScheme: 'none'
				}
			}
		});
		ctx.rawStore.seed('groups', [
			{ id: GROUP_ALPHA, organization_id: ctx.auth.orgId, name: 'Alpha' },
			{ id: 'foreign', organization_id: 'other-org', name: 'Foreign' }
		]);
		ctx.signInRosterPersonnelLookup = {
			findPersonnelForRosterSnapshot: async () => [
				{ id: 'p-known', rank: 'SGT', last_name: 'Smith', first_name: 'Jane', group_id: GROUP_ALPHA, group_name: null },
				{
					id: 'p-unknown',
					rank: 'SPC',
					last_name: 'Taylor',
					first_name: 'Morgan',
					group_id: 'foreign',
					group_name: null
				}
			]
		};
		const groupRead = vi.spyOn(ctx.rawStore, 'findMany');

		await handleUseCaseRequest(_postConfig, ctx, {
			title: 'Training attendance',
			personnelIds: ['p-known', 'p-unknown']
		});

		const stored = await ctx.store.findMany<Record<string, unknown>>('sign_in_rosters', ctx.auth.orgId);
		expect(stored[0].personnel_snapshot).toEqual([
			expect.objectContaining({ id: 'p-known', group: 'Alpha' }),
			expect.objectContaining({ id: 'p-unknown', group: '' })
		]);
		expect(groupRead.mock.calls.find(([table]) => table === 'groups')).toMatchObject([
			'groups',
			ctx.auth.orgId,
			undefined,
			{ select: 'id, name', inFilters: { id: [GROUP_ALPHA, 'foreign'] } }
		]);
	});

	it('uses policy-first route configs for sign-in roster reads and creation', () => {
		expect('permission' in _getConfig).toBe(false);
		expect('permission' in _postConfig).toBe(false);
		expect(_getConfig.policyAction).toBe(POLICY_ACTION_CATALOG.training.viewRecords);
		expect(_postConfig.policyAction).toBe(POLICY_ACTION_CATALOG.training.manageSignInRosters);
		expect(_getConfig.policyResource).toEqual({ kind: 'unscoped' });
		expect(_postConfig.policyResource).toEqual({ kind: 'unscoped' });
	});

	it('persists sign-in rosters through the Training record policy for operators', async () => {
		let legacyEditCalled = false;
		const findPersonnelForRosterSnapshot = vi.fn(async () => [
			{
				id: 'p-alpha',
				rank: 'SGT',
				last_name: 'Smith',
				first_name: 'Jane',
				group_id: GROUP_ALPHA,
				group_name: 'Alpha'
			}
		]);
		const ctx = createTestContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'view',
					personnel: 'none',
					training: 'operate',
					criticalTasks: 'view',
					onboarding: 'view',
					ratingScheme: 'view'
				},
				scopeSet: { kind: 'organization' },
				requireEdit() {
					legacyEditCalled = true;
					throw new Error('legacy Training edit flag should not decide sign-in roster writes');
				}
			}
		});
		ctx.signInRosterPersonnelLookup = {
			findPersonnelForRosterSnapshot
		};
		seedPersonnel(ctx);

		const result = (await handleUseCaseRequest(_postConfig, ctx, {
			title: 'Annual AT Sign-In',
			rosterDate: '2026-05-02',
			blankDate: false,
			separateByGroup: true,
			sortBy: 'rank',
			personnelSnapshot: [{ id: 'p-alpha', rank: 'FAKE', lastName: 'Injected', firstName: 'Payload' }],
			filterConfig: { groups: ['Alpha'] }
		})) as Record<string, unknown>;

		expect(findPersonnelForRosterSnapshot).toHaveBeenCalledWith(ctx.auth.orgId, ['p-alpha']);
		expect(result).toMatchObject({
			title: 'Annual AT Sign-In',
			sortBy: 'rank'
		});
		expect(legacyEditCalled).toBe(false);

		const stored = await ctx.store.findMany('sign_in_rosters', ctx.auth.orgId);
		expect(stored).toHaveLength(1);
		expect(stored[0]).toMatchObject({
			personnel_ids: ['p-alpha'],
			scope_group_ids: [GROUP_ALPHA],
			personnel_snapshot: [
				{
					id: 'p-alpha',
					rank: 'SGT',
					lastName: 'Smith',
					firstName: 'Jane',
					group: 'Alpha',
					groupId: GROUP_ALPHA
				}
			],
			filter_config: { groups: ['Alpha'], ranks: [] }
		});
		expect(ctx.auditPort.events[0]).toMatchObject({
			action: 'sign_in_roster.created',
			resourceType: 'sign_in_roster'
		});
	});

	it('sorts rank snapshots with the Organization rank catalog and keeps unknown ranks last', async () => {
		const ctx = createTestContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'view',
					personnel: 'none',
					training: 'operate',
					criticalTasks: 'view',
					onboarding: 'view',
					ratingScheme: 'view'
				},
				scopeSet: { kind: 'organization' }
			}
		});
		ctx.rawStore.seed('organization_rank_catalog', [
			rankCatalogRow({ code: 'PO2', label: 'Petty Officer Second Class', service: 'navy', pay_grade: 'E-5' }),
			rankCatalogRow({ code: 'SGT', label: 'Sergeant', service: 'army', pay_grade: 'E-5' }),
			rankCatalogRow({ code: 'SSgt', label: 'Staff Sergeant', service: 'air-force', pay_grade: 'E-5' })
		]);
		ctx.signInRosterPersonnelLookup = {
			findPersonnelForRosterSnapshot: vi.fn(async () => [
				signInPersonnel({ id: 'unknown', rank: 'LOCAL-CADET', last_name: 'Able' }),
				signInPersonnel({ id: 'navy-e5', rank: 'PO2', last_name: 'Baker' }),
				signInPersonnel({ id: 'army-e5', rank: 'SGT', last_name: 'Able' }),
				signInPersonnel({ id: 'air-force-e5', rank: 'SSgt', last_name: 'Charlie' })
			])
		};

		await handleUseCaseRequest(_postConfig, ctx, {
			title: 'Joint Sign-In',
			rosterDate: '2026-05-02',
			blankDate: false,
			separateByGroup: false,
			sortBy: 'rank',
			personnelIds: ['unknown', 'navy-e5', 'army-e5', 'air-force-e5']
		});

		const stored = await ctx.store.findMany<{ personnel_snapshot?: Array<{ id: string }> }>(
			'sign_in_rosters',
			ctx.auth.orgId
		);
		expect((stored[0]?.personnel_snapshot as Array<{ id: string }>).map((row) => row.id)).toEqual([
			'navy-e5',
			'army-e5',
			'air-force-e5',
			'unknown'
		]);
	});

	it('orders alphabetical snapshots and persists the roster filters', async () => {
		const ctx = createTestContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'view',
					personnel: 'none',
					training: 'operate',
					criticalTasks: 'view',
					onboarding: 'view',
					ratingScheme: 'view'
				},
				scopeSet: { kind: 'organization' }
			}
		});
		ctx.signInRosterPersonnelLookup = {
			findPersonnelForRosterSnapshot: vi.fn(async () => [
				signInPersonnel({ id: 'p-smith', rank: 'SGT', last_name: 'Smith', first_name: 'Jane' }),
				signInPersonnel({ id: 'p-adams', rank: 'PO2', last_name: 'Adams', first_name: 'Avery' })
			])
		};

		await handleUseCaseRequest(_postConfig, ctx, {
			title: 'Alphabetical Sign-In',
			rosterDate: '2026-05-02',
			blankDate: false,
			separateByGroup: false,
			sortBy: 'alphabetical',
			personnelIds: ['p-smith', 'p-adams'],
			filterConfig: { groups: ['Alpha'], ranks: ['SGT', 'PO2'] }
		});

		const stored = await ctx.store.findMany<{
			personnel_ids?: string[];
			personnel_snapshot?: Array<{ id: string; rank: string; lastName: string; firstName: string }>;
			filter_config?: { groups: string[]; ranks: string[] } | null;
			sort_by?: string;
		}>('sign_in_rosters', ctx.auth.orgId);
		expect(stored[0]).toMatchObject({
			personnel_ids: ['p-smith', 'p-adams'],
			filter_config: { groups: ['Alpha'], ranks: ['SGT', 'PO2'] },
			sort_by: 'alphabetical',
			personnel_snapshot: [
				{ id: 'p-adams', rank: 'PO2', lastName: 'Adams', firstName: 'Avery' },
				{ id: 'p-smith', rank: 'SGT', lastName: 'Smith', firstName: 'Jane' }
			]
		});
	});

	it('marks rosters with unassigned personnel as organization-only', async () => {
		const ctx = createTestContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'view',
					personnel: 'none',
					training: 'operate',
					criticalTasks: 'view',
					onboarding: 'view',
					ratingScheme: 'view'
				},
				scopeSet: { kind: 'organization' }
			}
		});
		ctx.signInRosterPersonnelLookup = {
			findPersonnelForRosterSnapshot: vi.fn(async () => [
				{
					id: 'p-alpha',
					rank: 'SGT',
					last_name: 'Smith',
					first_name: 'Jane',
					group_id: GROUP_ALPHA,
					group_name: 'Alpha'
				},
				{
					id: 'p-unassigned',
					rank: 'SPC',
					last_name: 'Taylor',
					first_name: 'Morgan',
					group_id: null,
					group_name: null
				}
			])
		};

		await handleUseCaseRequest(_postConfig, ctx, {
			title: 'Mixed Assignment Sign-In',
			personnelIds: ['p-alpha', 'p-unassigned']
		});

		const stored = await ctx.store.findMany('sign_in_rosters', ctx.auth.orgId);
		expect(stored[0]).toMatchObject({
			personnel_ids: ['p-alpha', 'p-unassigned'],
			scope_group_ids: [],
			personnel_snapshot: [
				expect.objectContaining({ id: 'p-alpha', groupId: GROUP_ALPHA }),
				expect.objectContaining({ id: 'p-unassigned', groupId: null, group: '' })
			]
		});
	});

	it('denies sign-in roster creation through the Training policy decision', async () => {
		const ctx = createTestContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'none',
					personnel: 'view',
					training: 'view',
					criticalTasks: 'none',
					onboarding: 'none',
					ratingScheme: 'none'
				},
				scopeSet: { kind: 'organization' }
			}
		});

		await expect(
			handleUseCaseRequest(_postConfig, ctx, {
				title: 'Annual AT Sign-In',
				personnelSnapshot: [{ id: 'p-1' }]
			})
		).rejects.toMatchObject({ status: 403 });
		expect(ctx.auditPort.events).toEqual([
			expect.objectContaining({
				action: 'policy.denied',
				resourceType: 'training.manageSignInRosters'
			})
		]);
	});

	it('rejects malformed, duplicate, and oversized personnel selections before insert', async () => {
		const malformed = createTestContext();
		seedPersonnel(malformed);

		await expect(
			handleUseCaseRequest(_postConfig, malformed, {
				title: 'Annual AT Sign-In',
				personnelSnapshot: [{ rank: 'SGT' }]
			})
		).rejects.toMatchObject({ status: 400, message: 'Personnel snapshot contains a missing or invalid id' });
		await expect(malformed.store.findMany('sign_in_rosters', malformed.auth.orgId)).resolves.toHaveLength(0);

		const duplicate = createTestContext();
		seedPersonnel(duplicate);

		await expect(
			handleUseCaseRequest(_postConfig, duplicate, {
				title: 'Annual AT Sign-In',
				personnelSnapshot: [{ id: 'p-alpha' }, { id: 'p-alpha' }]
			})
		).rejects.toMatchObject({ status: 400, message: 'Personnel selection contains duplicate ids' });
		await expect(duplicate.store.findMany('sign_in_rosters', duplicate.auth.orgId)).resolves.toHaveLength(0);

		const oversized = createTestContext();
		seedPersonnel(oversized);

		await expect(
			handleUseCaseRequest(_postConfig, oversized, {
				title: 'Annual AT Sign-In',
				personnelSnapshot: Array.from({ length: 501 }, (_, index) => ({ id: `p-${index}` }))
			})
		).rejects.toMatchObject({ status: 400, message: 'Personnel selection is limited to 500 personnel' });
		await expect(oversized.store.findMany('sign_in_rosters', oversized.auth.orgId)).resolves.toHaveLength(0);
	});

	it('rejects unknown and out-of-scope personnel selections before insert', async () => {
		const unknown = createTestContext();
		seedPersonnel(unknown);

		await expect(
			handleUseCaseRequest(_postConfig, unknown, {
				title: 'Annual AT Sign-In',
				personnelSnapshot: [{ id: 'p-missing' }]
			})
		).rejects.toMatchObject({ status: 400, message: 'Personnel selection includes unknown personnel' });
		await expect(unknown.store.findMany('sign_in_rosters', unknown.auth.orgId)).resolves.toHaveLength(0);

		const scoped = createTestContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'view',
					personnel: 'view',
					training: 'operate',
					criticalTasks: 'view',
					onboarding: 'view',
					ratingScheme: 'view'
				},
				scopeSet: { kind: 'groups', groupIds: [GROUP_ALPHA] }
			}
		});
		seedPersonnel(scoped);

		await expect(
			handleUseCaseRequest(_postConfig, scoped, {
				title: 'Annual AT Sign-In',
				personnelSnapshot: [{ id: 'p-bravo' }]
			})
		).rejects.toMatchObject({ status: 403, message: 'You do not have access to personnel outside your group' });
		await expect(scoped.rawStore.findMany('sign_in_rosters', scoped.auth.orgId)).resolves.toHaveLength(0);
	});

	it('omits out-of-scope, mixed-scope, and organization-only rosters for group-scoped readers', async () => {
		const ctx = createTestContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'view',
					personnel: 'view',
					training: 'view',
					criticalTasks: 'view',
					onboarding: 'view',
					ratingScheme: 'view'
				},
				scopeSet: { kind: 'groups', groupIds: [GROUP_ALPHA] }
			}
		});
		ctx.rawStore.seed('sign_in_rosters', [
			{
				id: 'roster-alpha',
				organization_id: ctx.auth.orgId,
				title: 'Alpha',
				scope_group_ids: [GROUP_ALPHA],
				personnel_ids: ['p-alpha'],
				personnel_snapshot: [],
				created_at: '2026-05-04T10:00:00.000Z'
			},
			{
				id: 'roster-mixed',
				organization_id: ctx.auth.orgId,
				title: 'Mixed',
				scope_group_ids: [GROUP_ALPHA, GROUP_BRAVO],
				personnel_ids: ['p-alpha', 'p-bravo'],
				personnel_snapshot: [],
				created_at: '2026-05-03T10:00:00.000Z'
			},
			{
				id: 'roster-bravo',
				organization_id: ctx.auth.orgId,
				title: 'Bravo',
				scope_group_ids: [GROUP_BRAVO],
				personnel_ids: ['p-bravo'],
				personnel_snapshot: [],
				created_at: '2026-05-02T10:00:00.000Z'
			},
			{
				id: 'roster-org-only',
				organization_id: ctx.auth.orgId,
				title: 'Org Only',
				scope_group_ids: [],
				personnel_ids: [],
				personnel_snapshot: [],
				created_at: '2026-05-01T10:00:00.000Z'
			}
		]);

		const result = (await handleUseCaseRequest(_getConfig, ctx, { limit: 20, offset: 0 })) as {
			rosters: Array<{ id: string }>;
			total: number;
		};

		expect(result.rosters.map((roster) => roster.id)).toEqual(['roster-alpha']);
		expect(result.total).toBe(1);
	});
});

function signInPersonnel(overrides: Partial<SignInRosterPersonnelLookupRecord>): SignInRosterPersonnelLookupRecord {
	return {
		id: overrides.id ?? 'person-1',
		rank: overrides.rank ?? 'SGT',
		last_name: overrides.last_name ?? 'Able',
		first_name: overrides.first_name ?? 'Alex',
		group_id: GROUP_ALPHA,
		group_name: 'Alpha',
		...overrides
	};
}

function rankCatalogRow(overrides: Record<string, unknown>): Record<string, unknown> {
	return {
		id: overrides.id ?? `rank-${overrides.code ?? 'SGT'}`,
		organization_id: 'org-1',
		code: overrides.code ?? 'SGT',
		label: overrides.label ?? overrides.code ?? 'Sergeant',
		service: overrides.service ?? 'army',
		category: overrides.category ?? 'enlisted',
		pay_grade: overrides.pay_grade ?? 'E-5',
		state: overrides.state ?? 'active',
		source: overrides.source ?? 'custom',
		sort_order: overrides.sort_order ?? 0,
		...overrides
	};
}
