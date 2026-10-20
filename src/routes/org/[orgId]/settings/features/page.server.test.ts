import { describe, expect, it, vi } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { createReadyAppShellRouteData } from '../../appShell.test-support';

const { loadWithContextMock } = vi.hoisted(() => ({ loadWithContextMock: vi.fn() }));

vi.mock('$lib/server/adapters/httpAdapter', async () => {
	const actual = await vi.importActual<typeof import('$lib/server/adapters/httpAdapter')>(
		'$lib/server/adapters/httpAdapter'
	);
	return { ...actual, loadWithContext: loadWithContextMock };
});

import { load } from './+page.server';
import { loadWithContextCore } from '$lib/server/adapters/httpAdapter';

describe('features settings page server', () => {
	it('denies a member with configure authority before reading the unit', async () => {
		const ctx = createTestContext({
			auth: {
				orgId: 'org-1',
				role: 'member',
				isPrivileged: false,
				capabilityMap: {
					calendar: 'configure',
					personnel: 'configure',
					training: 'configure',
					criticalTasks: 'configure',
					onboarding: 'configure',
					ratingScheme: 'configure'
				},
				scopeSet: { kind: 'organization' }
			}
		});
		const context = vi.fn();
		loadWithContextMock.mockImplementationOnce(async (_locals, _cookies, _orgId, config) =>
			loadWithContextCore(ctx, config, () => {
				context();
				return config.context(ctx);
			})
		);

		await expect(
			load({
				locals: {},
				cookies: {},
				parent: async () => createReadyAppShellRouteData({ orgId: 'org-1', orgName: 'C Co', orgUrlSegment: 'c-co' })
			} as never)
		).rejects.toMatchObject({ status: 403 });
		expect(context).not.toHaveBeenCalled();
	});
});
