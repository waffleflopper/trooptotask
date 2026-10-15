import { describe, expect, it, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseSignInRosterPersonnelLookupPort } from '$features/personnel/index.server';
import { createRosterTestContext, selectRosterContext, selectRosterCreationContext } from './rosterTestContexts';
import { handleUseCaseRequest } from '$lib/server/adapters/httpAdapter';
import type { SignInRosterPersonnelLookupRecord } from '$features/personnel/contracts';
import { _getConfig, _postConfig } from './+server';

const PERSON_1 = '00000000-0000-4000-8000-000000000010';
const P_1 = '00000000-0000-4000-8000-000000000011';
const P_ADAMS = '00000000-0000-4000-8000-000000000012';
const P_ALPHA = '00000000-0000-4000-8000-000000000013';
const P_BRAVO = '00000000-0000-4000-8000-000000000014';
const P_FOREIGN = '00000000-0000-4000-8000-000000000015';
const P_KNOWN = '00000000-0000-4000-8000-000000000016';
const P_MISSING = '00000000-0000-4000-8000-000000000017';
const P_SMITH = '00000000-0000-4000-8000-000000000018';
const P_UNASSIGNED = '00000000-0000-4000-8000-000000000019';
const P_UNKNOWN = '00000000-0000-4000-8000-00000000001a';

const RETIRED_RANK_PERSON = '00000000-0000-4000-8000-000000000020';
const UNKNOWN_RANK_PERSON = '00000000-0000-4000-8000-000000000021';
const NAVY_E5_PERSON = '00000000-0000-4000-8000-000000000022';
const ARMY_E5_PERSON = '00000000-0000-4000-8000-000000000023';
const AIR_FORCE_E5_PERSON = '00000000-0000-4000-8000-000000000024';
const GROUP_ALPHA = 'group-alpha';
const GROUP_BRAVO = 'group-bravo';

function seedPersonnel(ctx: ReturnType<typeof createRosterTestContext>) {
	ctx.rawStore.seed('groups', [
		{ id: GROUP_ALPHA, organization_id: ctx.auth.orgId, name: 'Alpha' },
		{ id: GROUP_BRAVO, organization_id: ctx.auth.orgId, name: 'Bravo' }
	]);
	const personnel = [
		{
			id: P_ALPHA,
			orgId: ctx.auth.orgId,
			rank: 'SGT',
			lastName: 'Smith',
			firstName: 'Jane',
			groupId: GROUP_ALPHA,
			groupName: null
		},
		{
			id: P_BRAVO,
			orgId: ctx.auth.orgId,
			rank: 'SSG',
			lastName: 'Jones',
			firstName: 'Avery',
			groupId: GROUP_BRAVO,
			groupName: null
		},
		{
			id: P_FOREIGN,
			orgId: 'foreign-org',
			rank: 'SGT',
			lastName: 'Foreign',
			firstName: 'Peer',
			groupId: GROUP_ALPHA,
			groupName: null
		}
	];
	ctx.personnelLookup = {
		findPersonnelForRosterSnapshot: async (orgId, scopeSet, personnelIds) =>
			personnel.filter(
				(row) =>
					row.orgId === orgId &&
					personnelIds.includes(row.id) &&
					(scopeSet.kind === 'organization' || (row.groupId !== null && scopeSet.groupIds.includes(row.groupId)))
			)
	};
}

describe('/api/sign-in-rosters route config', () => {
	it("saves the Personnel provider's mapped Group and name facts in a canonical snapshot", async () => {
		const requests: URL[] = [];
		const supabase = createClient('http://127.0.0.1:9', 'synthetic-anon-key', {
			auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
			global: {
				fetch: async (input) => {
					requests.push(new URL(String(input)));
					return Response.json([
						{
							id: PERSON_1,
							rank: 'SGT',
							last_name: 'Smith',
							first_name: 'Jane',
							group_id: GROUP_ALPHA,
							groups: { name: 'Alpha' }
						}
					]);
				}
			}
		});
		const ctx = createRosterTestContext();
		ctx.personnelLookup = createSupabaseSignInRosterPersonnelLookupPort(() => supabase);

		await handleUseCaseRequest(_postConfig, ctx, { title: 'Training attendance', personnelIds: [PERSON_1] }, () =>
			selectRosterCreationContext(ctx)
		);

		const saved = await ctx.store.findMany<Record<string, unknown>>('sign_in_rosters', ctx.auth.orgId);
		expect(saved[0]).toMatchObject({
			scope_group_ids: [GROUP_ALPHA],
			personnel_snapshot: [
				{ id: PERSON_1, rank: 'SGT', lastName: 'Smith', firstName: 'Jane', group: 'Alpha', groupId: GROUP_ALPHA }
			]
		});
		expect(requests).toHaveLength(1);
		expect(requests[0].pathname).toBe('/rest/v1/personnel');
	});

	it('creates and reloads an independent sign-in roster with Calendar denied and no duty records', async () => {
		const ctx = createRosterTestContext({
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
		ctx.personnelLookup = {
			findPersonnelForRosterSnapshot: async () => [
				{
					id: P_ALPHA,
					rank: 'SGT',
					lastName: 'Smith',
					firstName: 'Jane',
					groupId: GROUP_ALPHA,
					groupName: 'Alpha'
				}
			]
		};
		const created = (await handleUseCaseRequest(
			_postConfig,
			ctx,
			{
				title: 'Independent training attendance',
				rosterDate: '2026-03-15',
				personnelIds: [P_ALPHA]
			},
			() => selectRosterCreationContext(ctx)
		)) as Record<string, unknown>;
		const result = await handleUseCaseRequest(_getConfig, ctx, { limit: 20, offset: 0 }, () =>
			selectRosterContext(ctx)
		);
		expect(result).toEqual({
			total: 1,
			rosters: [
				expect.objectContaining({
					id: created.id,
					title: 'Independent training attendance',
					rosterDate: '2026-03-15',
					personnelSnapshot: [
						{ id: P_ALPHA, rank: 'SGT', lastName: 'Smith', firstName: 'Jane', group: 'Alpha', groupId: GROUP_ALPHA }
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
		const ctx = createRosterTestContext({
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
		ctx.personnelLookup = {
			findPersonnelForRosterSnapshot: async () => [
				{ id: P_KNOWN, rank: 'SGT', lastName: 'Smith', firstName: 'Jane', groupId: GROUP_ALPHA, groupName: null },
				{
					id: P_UNKNOWN,
					rank: 'SPC',
					lastName: 'Taylor',
					firstName: 'Morgan',
					groupId: 'foreign',
					groupName: null
				}
			]
		};
		const groupRead = vi.spyOn(ctx.rawStore, 'findMany');

		await handleUseCaseRequest(
			_postConfig,
			ctx,
			{
				title: 'Training attendance',
				personnelIds: [P_KNOWN, P_UNKNOWN]
			},
			() => selectRosterCreationContext(ctx)
		);

		const stored = await ctx.store.findMany<Record<string, unknown>>('sign_in_rosters', ctx.auth.orgId);
		expect(stored[0].personnel_snapshot).toEqual([
			expect.objectContaining({ id: P_KNOWN, group: 'Alpha' }),
			expect.objectContaining({ id: P_UNKNOWN, group: '' })
		]);
		expect(groupRead.mock.calls.find(([table]) => table === 'groups')).toMatchObject([
			'groups',
			ctx.auth.orgId,
			undefined,
			{ select: 'id, name', inFilters: { id: [GROUP_ALPHA, 'foreign'] } }
		]);
	});

	it('persists sign-in rosters through the Training record policy for operators', async () => {
		const findPersonnelForRosterSnapshot = vi.fn(async () => [
			{
				id: P_ALPHA,
				rank: 'SGT',
				lastName: 'Smith',
				firstName: 'Jane',
				groupId: GROUP_ALPHA,
				groupName: 'Alpha'
			}
		]);
		const ctx = createRosterTestContext({
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
		seedPersonnel(ctx);
		ctx.personnelLookup = {
			findPersonnelForRosterSnapshot
		};

		const result = (await handleUseCaseRequest(
			_postConfig,
			ctx,
			{
				title: 'Annual AT Sign-In',
				rosterDate: '2026-05-02',
				blankDate: false,
				separateByGroup: true,
				sortBy: 'rank',
				personnelSnapshot: [{ id: P_ALPHA, rank: 'FAKE', lastName: 'Injected', firstName: 'Payload' }],
				filterConfig: { groups: ['Alpha'] }
			},
			() => selectRosterCreationContext(ctx)
		)) as Record<string, unknown>;

		expect(findPersonnelForRosterSnapshot).toHaveBeenCalledWith(ctx.auth.orgId, ctx.auth.scopeSet, [P_ALPHA]);
		expect(result).toMatchObject({
			title: 'Annual AT Sign-In',
			sortBy: 'rank'
		});

		const stored = await ctx.store.findMany('sign_in_rosters', ctx.auth.orgId);
		expect(stored).toHaveLength(1);
		expect(stored[0]).toMatchObject({
			personnel_ids: [P_ALPHA],
			scope_group_ids: [GROUP_ALPHA],
			personnel_snapshot: [
				{
					id: P_ALPHA,
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

	it('sorts a Training-only scoped sign-in snapshot with active and retired ranks before unknown ranks', async () => {
		const ctx = createRosterTestContext({
			auth: {
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'none',
					personnel: 'none',
					training: 'operate',
					criticalTasks: 'none',
					onboarding: 'none',
					ratingScheme: 'none'
				},
				scopeSet: { kind: 'groups', groupIds: [GROUP_ALPHA] }
			}
		});
		ctx.rawStore.seed('organization_rank_catalog', [
			rankCatalogRow({ code: 'SSG', label: 'Staff Sergeant', service: 'army', pay_grade: 'E-6', state: 'retired' }),
			rankCatalogRow({ code: 'PO2', label: 'Petty Officer Second Class', service: 'navy', pay_grade: 'E-5' }),
			rankCatalogRow({ code: 'SGT', label: 'Sergeant', service: 'army', pay_grade: 'E-5' }),
			rankCatalogRow({ code: 'SSgt', label: 'Staff Sergeant', service: 'air-force', pay_grade: 'E-5' })
		]);
		ctx.personnelLookup = {
			findPersonnelForRosterSnapshot: vi.fn(async () => [
				signInPersonnel({ id: RETIRED_RANK_PERSON, rank: 'SSG', lastName: 'Charlie' }),
				signInPersonnel({ id: UNKNOWN_RANK_PERSON, rank: 'LOCAL-CADET', lastName: 'Able' }),
				signInPersonnel({ id: NAVY_E5_PERSON, rank: 'PO2', lastName: 'Baker' }),
				signInPersonnel({ id: ARMY_E5_PERSON, rank: 'SGT', lastName: 'Able' }),
				signInPersonnel({ id: AIR_FORCE_E5_PERSON, rank: 'SSgt', lastName: 'Charlie' })
			])
		};
		await handleUseCaseRequest(
			_postConfig,
			ctx,
			{
				title: 'Joint Sign-In',
				rosterDate: '2026-05-02',
				blankDate: false,
				separateByGroup: false,
				sortBy: 'rank',
				personnelIds: [UNKNOWN_RANK_PERSON, NAVY_E5_PERSON, ARMY_E5_PERSON, AIR_FORCE_E5_PERSON, RETIRED_RANK_PERSON]
			},
			() => selectRosterCreationContext(ctx)
		);

		const stored = await ctx.store.findMany<{ personnel_snapshot?: Array<{ id: string }> }>(
			'sign_in_rosters',
			ctx.auth.orgId
		);
		expect((stored[0]?.personnel_snapshot as Array<{ id: string }>).map((row) => row.id)).toEqual([
			RETIRED_RANK_PERSON,
			NAVY_E5_PERSON,
			ARMY_E5_PERSON,
			AIR_FORCE_E5_PERSON,
			UNKNOWN_RANK_PERSON
		]);
	});

	it('orders alphabetical snapshots and persists the roster filters', async () => {
		const ctx = createRosterTestContext({
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
		ctx.personnelLookup = {
			findPersonnelForRosterSnapshot: vi.fn(async () => [
				signInPersonnel({ id: P_SMITH, rank: 'SGT', lastName: 'Smith', firstName: 'Jane' }),
				signInPersonnel({ id: P_ADAMS, rank: 'PO2', lastName: 'Adams', firstName: 'Avery' })
			])
		};

		await handleUseCaseRequest(
			_postConfig,
			ctx,
			{
				title: 'Alphabetical Sign-In',
				rosterDate: '2026-05-02',
				blankDate: false,
				separateByGroup: false,
				sortBy: 'alphabetical',
				personnelIds: [P_SMITH, P_ADAMS],
				filterConfig: { groups: ['Alpha'], ranks: ['SGT', 'PO2'] }
			},
			() => selectRosterCreationContext(ctx)
		);

		const stored = await ctx.store.findMany<{
			personnel_ids?: string[];
			personnel_snapshot?: Array<{ id: string; rank: string; lastName: string; firstName: string }>;
			filter_config?: { groups: string[]; ranks: string[] } | null;
			sort_by?: string;
		}>('sign_in_rosters', ctx.auth.orgId);
		expect(stored[0]).toMatchObject({
			personnel_ids: [P_SMITH, P_ADAMS],
			filter_config: { groups: ['Alpha'], ranks: ['SGT', 'PO2'] },
			sort_by: 'alphabetical',
			personnel_snapshot: [
				{ id: P_ADAMS, rank: 'PO2', lastName: 'Adams', firstName: 'Avery' },
				{ id: P_SMITH, rank: 'SGT', lastName: 'Smith', firstName: 'Jane' }
			]
		});
	});

	it('marks rosters with unassigned personnel as organization-only', async () => {
		const ctx = createRosterTestContext({
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
		ctx.personnelLookup = {
			findPersonnelForRosterSnapshot: vi.fn(async () => [
				{
					id: P_ALPHA,
					rank: 'SGT',
					lastName: 'Smith',
					firstName: 'Jane',
					groupId: GROUP_ALPHA,
					groupName: 'Alpha'
				},
				{
					id: P_UNASSIGNED,
					rank: 'SPC',
					lastName: 'Taylor',
					firstName: 'Morgan',
					groupId: null,
					groupName: null
				}
			])
		};

		await handleUseCaseRequest(
			_postConfig,
			ctx,
			{
				title: 'Mixed Assignment Sign-In',
				personnelIds: [P_ALPHA, P_UNASSIGNED]
			},
			() => selectRosterCreationContext(ctx)
		);

		const stored = await ctx.store.findMany('sign_in_rosters', ctx.auth.orgId);
		expect(stored[0]).toMatchObject({
			personnel_ids: [P_ALPHA, P_UNASSIGNED],
			scope_group_ids: [],
			personnel_snapshot: [
				expect.objectContaining({ id: P_ALPHA, groupId: GROUP_ALPHA }),
				expect.objectContaining({ id: P_UNASSIGNED, groupId: null, group: '' })
			]
		});
	});

	it('denies sign-in roster creation through the Training policy decision', async () => {
		const ctx = createRosterTestContext({
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
			handleUseCaseRequest(
				_postConfig,
				ctx,
				{
					title: 'Annual AT Sign-In',
					personnelSnapshot: [{ id: P_1 }]
				},
				() => selectRosterCreationContext(ctx)
			)
		).rejects.toMatchObject({ status: 403 });
		expect(ctx.auditPort.events).toEqual([
			expect.objectContaining({
				action: 'policy.denied',
				resourceType: 'training.manageSignInRosters'
			})
		]);
	});

	it('rejects a malformed roster title or option before insert', async () => {
		const ctx = createRosterTestContext();
		seedPersonnel(ctx);

		for (const [body, message] of [
			[{ title: 5 }, 'Title is required'],
			[{ title: '   ' }, 'Title is required'],
			[{ title: 'Annual AT Sign-In', blankDate: 'yes' }, 'Choose whether the date is left blank'],
			[{ title: 'Annual AT Sign-In', separateByGroup: 1 }, 'Choose whether to separate by Group']
		] as const) {
			await expect(
				handleUseCaseRequest(_postConfig, ctx, { ...body, personnelSnapshot: [{ id: P_ALPHA }] }, () =>
					selectRosterCreationContext(ctx)
				)
			).rejects.toMatchObject({ status: 400, message });
		}
		await expect(ctx.store.findMany('sign_in_rosters', ctx.auth.orgId)).resolves.toHaveLength(0);
	});

	it('rejects malformed, duplicate, and oversized personnel selections before insert', async () => {
		const malformed = createRosterTestContext();
		seedPersonnel(malformed);

		await expect(
			handleUseCaseRequest(
				_postConfig,
				malformed,
				{
					title: 'Annual AT Sign-In',
					personnelSnapshot: [{ rank: 'SGT' }]
				},
				() => selectRosterCreationContext(malformed)
			)
		).rejects.toMatchObject({ status: 400, message: 'Personnel snapshot contains a missing or invalid id' });
		await expect(malformed.store.findMany('sign_in_rosters', malformed.auth.orgId)).resolves.toHaveLength(0);

		const duplicate = createRosterTestContext();
		seedPersonnel(duplicate);

		await expect(
			handleUseCaseRequest(
				_postConfig,
				duplicate,
				{
					title: 'Annual AT Sign-In',
					personnelSnapshot: [{ id: P_ALPHA }, { id: P_ALPHA }]
				},
				() => selectRosterCreationContext(duplicate)
			)
		).rejects.toMatchObject({ status: 400, message: 'Personnel selection contains duplicate ids' });
		await expect(duplicate.store.findMany('sign_in_rosters', duplicate.auth.orgId)).resolves.toHaveLength(0);

		const oversized = createRosterTestContext();
		seedPersonnel(oversized);

		await expect(
			handleUseCaseRequest(
				_postConfig,
				oversized,
				{
					title: 'Annual AT Sign-In',
					personnelSnapshot: Array.from({ length: 501 }, (_, index) => ({ id: `p-${index}` }))
				},
				() => selectRosterCreationContext(oversized)
			)
		).rejects.toMatchObject({ status: 400, message: 'Personnel selection is limited to 500 personnel' });
		await expect(oversized.store.findMany('sign_in_rosters', oversized.auth.orgId)).resolves.toHaveLength(0);
	});

	it('rejects unknown and out-of-scope personnel selections before insert', async () => {
		for (const personnelId of [P_MISSING, P_FOREIGN]) {
			const unknown = createRosterTestContext();
			seedPersonnel(unknown);
			await expect(
				handleUseCaseRequest(
					_postConfig,
					unknown,
					{
						title: 'Annual AT Sign-In',
						personnelSnapshot: [{ id: personnelId }]
					},
					() => selectRosterCreationContext(unknown)
				)
			).rejects.toMatchObject({ status: 400, message: 'Personnel selection includes unknown personnel' });
			await expect(unknown.store.findMany('sign_in_rosters', unknown.auth.orgId)).resolves.toHaveLength(0);
		}

		const scoped = createRosterTestContext({
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
			handleUseCaseRequest(
				_postConfig,
				scoped,
				{
					title: 'Annual AT Sign-In',
					personnelSnapshot: [{ id: P_BRAVO }]
				},
				() => selectRosterCreationContext(scoped)
			)
		).rejects.toMatchObject({ status: 400, message: 'Personnel selection includes unknown personnel' });
		await expect(scoped.rawStore.findMany('sign_in_rosters', scoped.auth.orgId)).resolves.toHaveLength(0);
	});

	it('omits out-of-scope, mixed-scope, and organization-only rosters for group-scoped readers', async () => {
		const ctx = createRosterTestContext({
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
				personnel_ids: [P_ALPHA],
				personnel_snapshot: [],
				created_at: '2026-05-04T10:00:00.000Z'
			},
			{
				id: 'roster-mixed',
				organization_id: ctx.auth.orgId,
				title: 'Mixed',
				scope_group_ids: [GROUP_ALPHA, GROUP_BRAVO],
				personnel_ids: [P_ALPHA, P_BRAVO],
				personnel_snapshot: [],
				created_at: '2026-05-03T10:00:00.000Z'
			},
			{
				id: 'roster-bravo',
				organization_id: ctx.auth.orgId,
				title: 'Bravo',
				scope_group_ids: [GROUP_BRAVO],
				personnel_ids: [P_BRAVO],
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
			},
			{
				id: 'roster-foreign',
				organization_id: 'foreign-org',
				title: 'Foreign',
				scope_group_ids: [GROUP_ALPHA],
				personnel_ids: [P_FOREIGN],
				personnel_snapshot: [],
				created_at: '2026-05-05T10:00:00.000Z'
			}
		]);

		const result = (await handleUseCaseRequest(_getConfig, ctx, { limit: 20, offset: 0 }, () =>
			selectRosterContext(ctx)
		)) as {
			rosters: Array<{ id: string }>;
			total: number;
		};

		expect(result.rosters.map((roster) => roster.id)).toEqual(['roster-alpha']);
		expect(result.total).toBe(1);
	});

	it('falls back to the default page size for a non-numeric limit and accepts only instant date bounds', async () => {
		const parse = (query: string) =>
			Promise.resolve().then(() =>
				_getConfig.parseInput?.({ url: new URL(`http://localhost/api/sign-in-rosters?${query}`) } as never)
			);

		await expect(parse('limit=abc')).resolves.toMatchObject({ limit: 20, offset: 0 });
		await expect(
			parse('createdFrom=2026-02-01T05:00:00.000Z&createdBefore=2026-02-04T05:00:00.000Z')
		).resolves.toMatchObject({ createdFrom: '2026-02-01T05:00:00.000Z', createdBefore: '2026-02-04T05:00:00.000Z' });
		for (const query of ['createdFrom=2026-02-01', 'createdBefore=2026-02-30T00:00:00Z', 'createdBefore=soon']) {
			await expect(parse(query)).rejects.toMatchObject({ status: 400, message: 'Use a valid date range' });
		}
	});

	it('refuses the day-only from and to range a tab loaded before the instant bounds still sends', async () => {
		const parse = (query: string) =>
			Promise.resolve().then(() =>
				_getConfig.parseInput?.({ url: new URL(`http://localhost/api/sign-in-rosters?${query}`) } as never)
			);

		for (const query of ['from=2026-10-14&to=2026-10-14&limit=20&offset=0', 'from=2026-02-30', 'to=2026-10-14']) {
			await expect(parse(query)).rejects.toMatchObject({ status: 400, message: 'Use a valid date range' });
		}
		await expect(parse('from=&to=&limit=20')).resolves.toMatchObject({ createdFrom: null, createdBefore: null });
	});
});

function signInPersonnel(overrides: Partial<SignInRosterPersonnelLookupRecord>): SignInRosterPersonnelLookupRecord {
	return {
		id: overrides.id ?? 'person-1',
		rank: overrides.rank ?? 'SGT',
		lastName: overrides.lastName ?? 'Able',
		firstName: overrides.firstName ?? 'Alex',
		groupId: GROUP_ALPHA,
		groupName: 'Alpha',
		...overrides
	};
}

function rankCatalogRow(overrides: Record<string, unknown>): Record<string, unknown> {
	return {
		id: overrides.id ?? `rank-${overrides.code ?? 'SGT'}`,
		organization_id: 'test-org',
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
