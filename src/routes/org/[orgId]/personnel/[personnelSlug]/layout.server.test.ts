import { describe, expect, it, vi } from 'vitest';
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
		compatibilityLanes: {},
		scopeSet: { kind: 'organization' },
		requireGroupAccess: vi.fn(async () => {}),
		...overrides
	};
}

function makePersonnel(overrides: Record<string, unknown> = {}) {
	return {
		id: 'person-1',
		slug: 'rivera-monica',
		rank: 'SGT',
		first_name: 'Monica',
		last_name: 'Rivera',
		mos: '68W',
		clinic_role: 'Medic',
		group_id: 'group-1',
		groups: { name: 'Alpha' },
		ets: null,
		deros: null,
		archived_at: null,
		...overrides
	};
}

function makeLoad(ctx: Record<string, unknown>) {
	const loadWithContext = vi.fn(async (_locals, _cookies, _orgId, config) => config.fn(ctx));
	const load = _createPersonnelDetailLayoutLoad({ loadWithContext });
	return { load, loadWithContext };
}

describe('personnel detail layout server load', () => {
	it('resolves the Personnel Slug once and returns persistent Soldier header data', async () => {
		const ctx = {
			rawStore: {
				findOne: vi.fn(async () => makePersonnel())
			},
			store: {
				findOne: vi.fn(async () => null)
			},
			auth: makeAuth(),
			audit: { log: vi.fn() },
			readOnlyGuard: { check: vi.fn(async () => false) }
		};
		const depends = vi.fn();
		const { load } = makeLoad(ctx);

		const result = await load({
			params: { orgId: 'org-1', personnelSlug: 'rivera-monica' },
			locals: {} as App.Locals,
			cookies: {} as never,
			depends
		} as never);

		expect(depends).toHaveBeenCalledWith('app:personnel-detail-header');
		expect(ctx.rawStore.findOne).toHaveBeenCalledWith(
			'personnel',
			'org-1',
			{ slug: 'rivera-monica' },
			expect.any(String)
		);
		expect(ctx.auth.requireGroupAccess).toHaveBeenCalledWith('person-1');
		expect(result.personnelDetailHeader.person).toMatchObject({
			id: 'person-1',
			rank: 'SGT',
			firstName: 'Monica',
			lastName: 'Rivera',
			groupName: 'Alpha'
		});
	});

	it('requires Personnel operate capability at the shared detail layout', async () => {
		const ctx = {
			rawStore: {
				findOne: vi.fn(async () => makePersonnel())
			},
			store: {
				findOne: vi.fn(async () => null)
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
			audit: { log: vi.fn() },
			readOnlyGuard: { check: vi.fn(async () => false) }
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
			rawStore: {
				findOne: vi.fn(async () => makePersonnel())
			},
			store: {
				findOne: vi.fn(async () => null)
			},
			auth: makeAuth({
				scopeSet: { kind: 'groups', groupIds: ['other-group'] }
			}),
			audit: { log: vi.fn() },
			readOnlyGuard: { check: vi.fn(async () => false) }
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
			rawStore: {
				findOne: vi.fn(async () => null)
			},
			store: {
				findOne: vi.fn(async () => null)
			},
			auth: makeAuth(),
			audit: { log: vi.fn() },
			readOnlyGuard: { check: vi.fn(async () => false) }
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
