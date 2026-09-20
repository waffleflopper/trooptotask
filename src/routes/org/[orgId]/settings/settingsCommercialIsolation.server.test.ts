import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { createReadyAppShellRouteData } from '$lib/test-support/appShellRouteData';

const { loadWithContextMock } = vi.hoisted(() => ({ loadWithContextMock: vi.fn() }));
vi.mock('$lib/server/adapters/httpAdapter', async () => ({
	...(await vi.importActual<typeof import('$lib/server/adapters/httpAdapter')>('$lib/server/adapters/httpAdapter')),
	loadWithContext: loadWithContextMock
}));

import { loadWithContextCore } from '$lib/server/adapters/httpAdapter';
import { load as loadGeneral } from './general/+page.server';

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
});
