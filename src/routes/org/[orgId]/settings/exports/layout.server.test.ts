import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	createReadyAppShellRouteData,
	createSuspendedAppShellRouteData,
	createOrganizationLoadEventData
} from '../../appShell.test-support';
import { createTestContext } from '$lib/server/adapters/inMemory';

const { loadWithContextMock } = vi.hoisted(() => ({ loadWithContextMock: vi.fn() }));
vi.mock('$lib/server/adapters/httpAdapter', () => ({ loadWithContext: loadWithContextMock }));

import { load } from './+layout.server';

type LoadEvent = Parameters<typeof load>[0];

function run(data: Parameters<typeof createOrganizationLoadEventData>[0]) {
	const depends = vi.fn();
	const result = load({ ...createOrganizationLoadEventData(data), cookies: {}, depends } as unknown as LoadEvent);
	return { depends, result: result as Promise<{ lastExport: unknown }> };
}

describe('Exports layout load', () => {
	beforeEach(() => {
		loadWithContextMock.mockReset();
	});

	it('reads the last export under a dependency that a finished download can invalidate', async () => {
		const ctx = createTestContext({ auth: { orgId: 'org-1', role: 'owner', isPrivileged: true } });
		loadWithContextMock.mockImplementation((_locals, _cookies, _orgId, config) =>
			config.fn({
				auth: ctx.auth,
				unitCounts: ctx.unitCounts,
				readLatestAuditEvent: async (action: string) =>
					action === 'export.created'
						? {
								id: 'e1',
								userId: 'user-1',
								actor: 'whitaker@example.com',
								action,
								resourceType: 'data_export',
								resourceId: null,
								details: null,
								createdAt: '2026-10-20T14:05:00.000Z'
							}
						: null
			})
		);

		const { depends, result } = run(createReadyAppShellRouteData());
		const data = await result;

		expect(depends).toHaveBeenCalledWith('app:settings-last-export');
		expect(depends).toHaveBeenCalledWith('app:org-core');
		expect(await data.lastExport).toEqual({
			format: 'json',
			at: '2026-10-20T14:05:00.000Z',
			actor: 'whitaker@example.com'
		});
	});

	it('returns no last export for a suspended unit', async () => {
		expect(await run(createSuspendedAppShellRouteData()).result).toEqual({ lastExport: null });
		expect(loadWithContextMock).not.toHaveBeenCalled();
	});
});
