import { describe, expect, it, vi } from 'vitest';
import { _createPersonnelDetailPageLoad } from './+page.server';

describe('personnel detail page server load', () => {
	it('resolves the Personnel Slug to the internal personnel id before loading detail streams', async () => {
		const ctx = {
			store: {
				findOne: vi.fn(async () => ({ id: 'person-1' })),
				findMany: vi.fn(async () => [])
			},
			auth: { orgId: 'org-1', requireGroupAccess: vi.fn(async () => {}) }
		};
		const loadWithContext = vi.fn(async (_locals, _cookies, _orgId, config) => config.fn(ctx));
		const load = _createPersonnelDetailPageLoad({ loadWithContext });
		const depends = vi.fn();

		await load({
			params: { orgId: 'org-1', personnelSlug: 'rivera-monica' },
			locals: {} as App.Locals,
			cookies: {} as never,
			depends
		} as never);

		expect(depends).toHaveBeenCalledWith('app:personnel-detail');
		expect(ctx.store.findOne).toHaveBeenCalledWith('personnel', 'org-1', { slug: 'rivera-monica' }, 'id');
		expect(ctx.store.findMany).toHaveBeenCalledWith('personnel_extended_info', 'org-1', {
			personnel_id: 'person-1'
		});
	});

	it('returns 404 for stale Personnel Slugs without loading detail data', async () => {
		const ctx = {
			store: {
				findOne: vi.fn(async () => null),
				findMany: vi.fn(async () => [])
			},
			auth: { orgId: 'org-1', requireGroupAccess: vi.fn(async () => {}) }
		};
		const loadWithContext = vi.fn(async (_locals, _cookies, _orgId, config) => config.fn(ctx));
		const load = _createPersonnelDetailPageLoad({ loadWithContext });

		await expect(
			load({
				params: { orgId: 'org-1', personnelSlug: 'old-rivera-monica' },
				locals: {} as App.Locals,
				cookies: {} as never,
				depends: vi.fn()
			} as never)
		).rejects.toMatchObject({ status: 404 });

		expect(ctx.store.findMany).not.toHaveBeenCalled();
	});
});
