import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import type { PersonnelRosterReader } from '$features/personnel/contracts';
import {
	createReadyAppShellRouteData,
	createSuspendedAppShellRouteData,
	createOrganizationLoadEventData
} from '../../appShell.test-support';

const { loadWithContextMock } = vi.hoisted(() => ({ loadWithContextMock: vi.fn() }));

vi.mock('$lib/server/adapters/httpAdapter', async () => {
	const actual = await vi.importActual<typeof import('$lib/server/adapters/httpAdapter')>(
		'$lib/server/adapters/httpAdapter'
	);
	return { ...actual, loadWithContext: loadWithContextMock };
});

import { load } from './+layout.server';
import { loadWithContextCore } from '$lib/server/adapters/httpAdapter';

function event(suspended = false) {
	return createOrganizationLoadEventData(
		(suspended ? createSuspendedAppShellRouteData : createReadyAppShellRouteData)({
			orgId: 'org-1',
			orgName: 'Test Org',
			orgUrlSegment: 'test-org'
		})
	) as never;
}

function admit(role: 'owner' | 'admin' | 'member') {
	const ctx = createTestContext({
		auth: {
			orgId: 'org-1',
			role,
			isPrivileged: role !== 'member',
			capabilityMap: {
				calendar: 'none',
				personnel: 'none',
				training: 'none',
				criticalTasks: 'none',
				onboarding: 'none',
				ratingScheme: 'none'
			},
			scopeSet: { kind: 'organization' }
		}
	});
	const reads = {
		auth: ctx.auth,
		roster: {
			list: async () => [{ id: 'p-1', rank: 'SGT', lastName: 'Rivera', firstName: 'Sam', archivedAt: null }]
		} as unknown as PersonnelRosterReader,
		memberLabels: async () => ({ 'u-1': 'SSG Doe, Pat' }),
		auditStore: { listLogs: async () => ({ logs: [], hasMore: false }), listActions: async () => ['org.renamed'] }
	};
	loadWithContextMock.mockImplementationOnce(async (_locals, _cookies, _orgId, config) =>
		loadWithContextCore(ctx, config, () => reads)
	);
}

describe('logs settings layout server', () => {
	beforeEach(() => vi.clearAllMocks());

	it('returns no picker lists for a suspended Organization without reading them', async () => {
		expect(await load(event(true))).toEqual({});
		expect(loadWithContextMock).not.toHaveBeenCalled();
	});

	it('denies a member without admin', async () => {
		admit('member');

		await expect(load(event())).rejects.toMatchObject({ status: 403 });
	});

	it.each(['owner', 'admin'] as const)('streams the people, members and actions to an %s', async (role) => {
		admit(role);

		const result = (await load(event())) as { filterOptions: Promise<unknown> };

		await expect(result.filterOptions).resolves.toEqual({
			people: [{ id: 'p-1', label: 'SGT Rivera, Sam', archived: false }],
			members: [{ userId: 'u-1', label: 'SSG Doe, Pat' }],
			actions: ['org.renamed']
		});
	});
});
