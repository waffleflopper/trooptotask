import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { createReadyAppShellRouteData } from '$lib/test-support/appShellRouteData';

const { loadWithContextMock } = vi.hoisted(() => ({ loadWithContextMock: vi.fn() }));
vi.mock('$lib/server/adapters/httpAdapter', async () => ({
	...(await vi.importActual<typeof import('$lib/server/adapters/httpAdapter')>('$lib/server/adapters/httpAdapter')),
	loadWithContext: loadWithContextMock
}));
vi.mock('$lib/config/billing', () => ({ isBillingEnabled: true }));

import { loadWithContextCore } from '$lib/server/adapters/httpAdapter';
import { load as loadGeneral } from './general/+page.server';
import { load as loadBilling } from './billing/+page.server';

const event = {
	locals: {},
	cookies: {},
	parent: async () => createReadyAppShellRouteData({ orgId: 'org-1', orgName: 'Clinic', orgUrlSegment: 'clinic' })
};

describe('settings commercial isolation', () => {
	beforeEach(() => loadWithContextMock.mockReset());

	it('keeps organization profile settings available when commercial storage is unavailable', async () => {
		const ctx = createTestContext({ auth: { orgId: 'org-1', role: 'admin', isPrivileged: true } });
		const commercialRead = vi.spyOn(ctx.rawStore, 'findOne').mockRejectedValue(new Error('Billing unavailable'));
		loadWithContextMock.mockImplementationOnce((_locals, _cookies, _orgId, config) => loadWithContextCore(ctx, config));

		const result = await loadGeneral(event as never);

		expect(result).toMatchObject({
			generalSettings: {
				sections: {
					organization: {
						id: 'org-1',
						name: 'Clinic',
						urlSlug: 'clinic',
						canUpdateProfile: true,
						canUpdateUrlSlug: true
					}
				}
			}
		});
		expect(commercialRead).not.toHaveBeenCalled();
		expect(result).not.toHaveProperty('effectiveTier');
		expect(result).not.toHaveProperty('planUsageSummary');
	});

	it('loads the retained billing page from its own organization snapshot and usage', async () => {
		const ctx = createTestContext({ auth: { orgId: 'org-1', role: 'owner', isPrivileged: true } });
		ctx.rawStore.seed('organizations', [{ id: 'org-1', tier: 'free', gift_tier: null, gift_expires_at: null }]);
		ctx.rawStore.seed('organization_billing_snapshots', [
			{
				id: 'snapshot-1',
				organization_id: 'org-1',
				source: 'stripe',
				commercial_plan: 'team',
				subscription_status: 'past_due',
				collection_status: 'payment_failed_grace',
				sync_status: 'synced'
			}
		]);
		ctx.rawStore.seed('personnel', [
			{ id: 'person-1', organization_id: 'org-1', archived_at: null },
			{ id: 'other-person', organization_id: 'org-2', archived_at: null }
		]);
		loadWithContextMock.mockImplementationOnce((_locals, _cookies, _orgId, config) => loadWithContextCore(ctx, config));

		const result = await loadBilling(event as never);

		expect(result).toMatchObject({
			effectiveTier: { tier: 'team', personnelCount: 1, isReadOnly: true, readOnlyReason: 'payment_failure' },
			planUsageSummary: {
				rows: expect.arrayContaining([expect.objectContaining({ dimension: 'active_personnel', used: 1 })])
			}
		});
	});
});
