import { describe, expect, it, vi } from 'vitest';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { _createPersonnelDetailLayoutLoad } from './+layout.server';

function makeAuth(overrides: Record<string, unknown> = {}) {
	return {
		orgId: 'org-1',
		role: 'member',
		capabilityMap: {
			calendar: 'view',
			personnel: 'operate',
			training: 'view',
			criticalTasks: 'view',
			onboarding: 'view',
			ratingScheme: 'view'
		},
		scopeSet: { kind: 'organization' },
		...overrides
	};
}

function makeScope(overrides: Record<string, unknown> = {}) {
	return {
		requireGroupAccess: vi.fn(async () => {}),
		requireGroupAccessBatch: vi.fn(async () => {}),
		...overrides
	};
}

function makePersonnel(overrides: Record<string, unknown> = {}) {
	return {
		id: 'person-1',
		slug: 'rivera-monica',
		rank: 'SGT',
		firstName: 'Monica',
		lastName: 'Rivera',
		mos: '68W',
		clinicRole: 'Medic',
		groupId: 'group-1',
		groupName: 'Alpha',
		ets: null,
		deros: null,
		archivedAt: null,
		...overrides
	};
}

function makeLoad(ctx: Record<string, unknown>) {
	const loadWithContext = vi.fn(async (_locals, _cookies, _orgId, config) => config.fn(ctx));
	const load = _createPersonnelDetailLayoutLoad({ loadWithContext });
	return { load, loadWithContext };
}

describe('personnel detail layout server load', () => {
	it('returns the header with service dates and the breadcrumb leaf, then streams the tab counts', async () => {
		const ctx = {
			organizationPersonnel: {
				findBySlug: vi.fn(async () => makePersonnel())
			},
			personnelSheets: {
				findSheetForPerson: vi.fn(async () => ({
					id: 'sheet-1',
					personnel_id: 'person-1',
					basd: '2019-06-11',
					date_of_rank: '2023-02-01'
				}))
			},
			artifactReads: { countRecords: vi.fn(async () => ({ openFollowUps: 3, archived: 4 })) },
			auth: makeAuth({ capabilityMap: { ...makeAuth().capabilityMap, calendar: 'none', personnel: 'configure' } }),
			scope: makeScope(),
			audit: { log: vi.fn() }
		};
		const depends = vi.fn();
		const { load, loadWithContext } = makeLoad(ctx);

		const result = await load({
			params: { orgId: 'org-1', personnelSlug: 'rivera-monica' },
			locals: {} as App.Locals,
			cookies: { get: () => undefined } as never,
			depends
		} as never);

		expect(depends).toHaveBeenCalledWith('app:personnel-detail-header', 'app:personnel-detail-counts');
		expect(ctx.organizationPersonnel.findBySlug).toHaveBeenCalledWith('rivera-monica');
		expect(loadWithContext).toHaveBeenCalledWith(
			expect.anything(),
			expect.anything(),
			'org-1',
			expect.objectContaining({
				policyAction: POLICY_ACTION_CATALOG.personnel.manageRecords,
				policyResource: { kind: 'unscoped' }
			})
		);
		expect(ctx.scope.requireGroupAccess).toHaveBeenCalledWith('person-1');
		expect(result.personnelDetailHeader).toMatchObject({
			person: { id: 'person-1', rank: 'SGT', firstName: 'Monica', lastName: 'Rivera', groupName: 'Alpha' },
			basd: '2019-06-11',
			dateOfRank: '2023-02-01'
		});
		expect(result.breadcrumbLabel).toBe('Rivera, Monica');
		await expect(result.personnelDetailLayout.tabCounts).resolves.toEqual({ log: 3, archived: 4 });
		await expect(result.personnelDetailLayout.availabilityToday).resolves.toBeNull();
	});

	it('keeps a count read that fails before the page renders from crashing the server', async () => {
		const failure = new Error('count read failed');
		const ctx = {
			organizationPersonnel: { findBySlug: vi.fn(async () => makePersonnel()) },
			personnelSheets: { findSheetForPerson: vi.fn(async () => null) },
			artifactReads: { countRecords: vi.fn(async () => Promise.reject(failure)) },
			auth: makeAuth({ capabilityMap: { ...makeAuth().capabilityMap, calendar: 'none', personnel: 'configure' } }),
			scope: makeScope(),
			audit: { log: vi.fn() }
		};
		const unhandled = vi.fn();
		process.on('unhandledRejection', unhandled);
		try {
			const result = await makeLoad(ctx).load({
				params: { orgId: 'org-1', personnelSlug: 'rivera-monica' },
				locals: {} as App.Locals,
				cookies: { get: () => undefined } as never,
				depends: vi.fn()
			} as never);
			await new Promise((resolve) => setTimeout(resolve, 0));

			expect(unhandled).not.toHaveBeenCalled();
			await expect(result.personnelDetailLayout.tabCounts).rejects.toBe(failure);
		} finally {
			process.off('unhandledRejection', unhandled);
		}
	});

	it('hides the tab counts from a viewer who may manage but not read sensitive records', async () => {
		const ctx = {
			organizationPersonnel: { findBySlug: vi.fn(async () => makePersonnel()) },
			personnelSheets: { findSheetForPerson: vi.fn(async () => null) },
			artifactReads: { countRecords: vi.fn(async () => ({ openFollowUps: 3, archived: 4 })) },
			auth: makeAuth({ capabilityMap: { ...makeAuth().capabilityMap, calendar: 'none' } }),
			scope: makeScope(),
			audit: { log: vi.fn() }
		};
		const { load } = makeLoad(ctx);

		const result = await load({
			params: { orgId: 'org-1', personnelSlug: 'rivera-monica' },
			locals: {} as App.Locals,
			cookies: { get: () => undefined } as never,
			depends: vi.fn()
		} as never);

		await expect(result.personnelDetailLayout.tabCounts).resolves.toBeNull();
		expect(ctx.artifactReads.countRecords).not.toHaveBeenCalled();
	});

	it('requires Personnel operate capability at the shared detail layout', async () => {
		const ctx = {
			organizationPersonnel: {
				findBySlug: vi.fn(async () => makePersonnel())
			},
			auth: makeAuth({
				capabilityMap: {
					calendar: 'view',
					personnel: 'view',
					training: 'view',
					criticalTasks: 'view',
					onboarding: 'view',
					ratingScheme: 'view'
				}
			}),
			scope: makeScope(),
			audit: { log: vi.fn() }
		};
		const { load } = makeLoad(ctx);

		await expect(
			load({
				params: { orgId: 'org-1', personnelSlug: 'rivera-monica' },
				locals: {} as App.Locals,
				cookies: {} as never,
				depends: vi.fn()
			} as never)
		).rejects.toMatchObject({ status: 403 });
	});

	it('blocks group-scoped users from Soldiers outside their scope', async () => {
		const ctx = {
			organizationPersonnel: {
				findBySlug: vi.fn(async () => makePersonnel())
			},
			auth: makeAuth({
				scopeSet: { kind: 'groups', groupIds: ['other-group'] }
			}),
			scope: makeScope(),
			audit: { log: vi.fn() }
		};
		const { load } = makeLoad(ctx);

		await expect(
			load({
				params: { orgId: 'org-1', personnelSlug: 'rivera-monica' },
				locals: {} as App.Locals,
				cookies: {} as never,
				depends: vi.fn()
			} as never)
		).rejects.toMatchObject({ status: 403 });
	});

	it('returns 404 for invalid Personnel Slugs', async () => {
		const ctx = {
			organizationPersonnel: {
				findBySlug: vi.fn(async () => null)
			},
			auth: makeAuth(),
			scope: makeScope(),
			audit: { log: vi.fn() }
		};
		const { load } = makeLoad(ctx);

		await expect(
			load({
				params: { orgId: 'org-1', personnelSlug: 'missing' },
				locals: {} as App.Locals,
				cookies: {} as never,
				depends: vi.fn()
			} as never)
		).rejects.toMatchObject({ status: 404 });
	});
});
