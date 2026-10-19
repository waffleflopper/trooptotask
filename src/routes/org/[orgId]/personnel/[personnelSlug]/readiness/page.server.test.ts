import { createTestContext } from '$lib/server/adapters/inMemory';
import { createRequestPersonnelDetailContext } from '$lib/server/adapters/requestContexts.server';
import { VIEWER_TIME_ZONE_COOKIE } from '$lib/utils/viewerTimeZone';
import { describe, expect, it, vi } from 'vitest';
import { _createPersonnelReadinessPageLoad } from './+page.server';

describe('personnel readiness page server load', () => {
	it("streams the slug-resolved Soldier's readiness sources as of the viewer's day", async () => {
		const ctx = createTestContext({ auth: { orgId: 'org-1' } });
		ctx.store.seed('personnel', [{ id: 'person-1', organization_id: 'org-1', slug: 'rivera-monica', group_id: null }]);
		const loadWithContext = vi.fn(async (_locals, _cookies, _orgId, config) => {
			if (config.context !== createRequestPersonnelDetailContext) throw new Error('unexpected context');
			return config.fn(ctx);
		});
		const training = Promise.resolve('training');
		const loadReadiness = vi.fn(async () => ({
			training,
			criticalTasks: Promise.resolve('critical tasks'),
			evaluation: Promise.resolve(null),
			loss: Promise.resolve('loss'),
			onboarding: Promise.resolve('onboarding'),
			attention: Promise.resolve('attention')
		}));
		const depends = vi.fn();
		const load = _createPersonnelReadinessPageLoad({
			loadWithContext,
			loadReadiness: loadReadiness as never
		});

		const result = await load({
			params: { orgId: 'org-1', personnelSlug: 'rivera-monica' },
			locals: {} as App.Locals,
			cookies: { get: (name: string) => (name === VIEWER_TIME_ZONE_COOKIE ? 'Pacific/Kiritimati' : undefined) },
			depends
		} as never);

		expect(depends).toHaveBeenCalledWith('app:personnel-detail-readiness');
		expect(loadReadiness).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({ id: 'person-1' }),
			result.asOf,
			loadWithContext
		);
		expect(result.asOf).toBe(new Date(Date.now() + 14 * 3600_000).toISOString().slice(0, 10));
		expect(Object.keys(result.readiness)).toEqual(['training', 'criticalTasks', 'evaluation', 'loss', 'onboarding']);
		expect(result.readiness.training).toBe(training);
	});
});
