import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { createTestContext } from '$lib/server/adapters/inMemory';
import { createReadyAppShellRouteData, createSuspendedAppShellRouteData } from '$lib/test-support/appShellRouteData';

const { createSupabaseDataStoreMock, getAdminClientMock, loadLogsSettingsMock, loadWithContextMock } = vi.hoisted(
	() => ({
		createSupabaseDataStoreMock: vi.fn(),
		getAdminClientMock: vi.fn(),
		loadLogsSettingsMock: vi.fn(),
		loadWithContextMock: vi.fn()
	})
);

vi.mock('$lib/server/adapters/httpAdapter', async () => {
	const actual = await vi.importActual<typeof import('$lib/server/adapters/httpAdapter')>(
		'$lib/server/adapters/httpAdapter'
	);

	return {
		...actual,
		loadWithContext: loadWithContextMock
	};
});

vi.mock('$lib/server/adapters/supabaseDataStore', () => ({
	createSupabaseDataStore: createSupabaseDataStoreMock
}));

vi.mock('$lib/server/supabase', () => ({
	getAdminClient: getAdminClientMock
}));

vi.mock('../settingsLogs.server', () => ({
	loadLogsSettings: loadLogsSettingsMock
}));

import { load } from './+page.server';
import { loadWithContextCore } from '$lib/server/adapters/httpAdapter';

describe('logs settings page server', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		getAdminClientMock.mockReturnValue({ admin: true });
		createSupabaseDataStoreMock.mockReturnValue({ store: 'admin-store' });
		loadLogsSettingsMock.mockResolvedValue({
			sections: {
				logs: {
					auditLogPage: {
						items: [],
						page: 1,
						limit: 100,
						total: 0,
						totalPages: 0
					}
				}
			}
		});
	});

	it('returns no page data when the parent org layout reports suspension', async () => {
		const result = await load({
			locals: {},
			cookies: {},
			parent: async () =>
				createSuspendedAppShellRouteData({
					orgId: 'org-1',
					orgName: 'Test Org',
					orgUrlSegment: 'test-org'
				})
		} as never);

		expect(result).toEqual({});
		expect(loadWithContextMock).not.toHaveBeenCalled();
		expect(loadLogsSettingsMock).not.toHaveBeenCalled();
	});

	it('denies admins before audit logs are fetched', async () => {
		const ctx = createTestContext({
			auth: {
				orgId: 'org-1',
				role: 'admin',
				isPrivileged: true,
				capabilityMap: {
					calendar: 'view',
					personnel: 'view',
					training: 'view',
					criticalTasks: 'view',
					onboarding: 'view',
					ratingScheme: 'view'
				},
				scopeSet: { kind: 'organization' }
			}
		});
		loadWithContextMock.mockImplementationOnce(async (_locals, _cookies, _orgId, config) =>
			loadWithContextCore(ctx, config)
		);

		await expect(
			load({
				locals: {},
				cookies: {},
				parent: async () =>
					createReadyAppShellRouteData({
						orgId: 'org-1',
						orgName: 'Test Org',
						orgUrlSegment: 'test-org',
						role: 'admin'
					})
			} as never)
		).rejects.toMatchObject({
			status: 403,
			body: { message: 'Only the organization owner can perform this action' }
		});
		expect(loadWithContextMock).toHaveBeenCalledWith(
			{},
			{},
			'org-1',
			expect.objectContaining({
				policyAction: POLICY_ACTION_CATALOG.organization.accessAuditLogs,
				policyResource: { kind: 'organization' }
			})
		);
		expect(getAdminClientMock).not.toHaveBeenCalled();
		expect(createSupabaseDataStoreMock).not.toHaveBeenCalled();
		expect(loadLogsSettingsMock).not.toHaveBeenCalled();
	});

	it('loads owner logs settings with shared page context', async () => {
		const ctx = createTestContext({
			auth: {
				orgId: 'org-1',
				role: 'owner',
				isPrivileged: true,
				capabilityMap: {
					calendar: 'view',
					personnel: 'view',
					training: 'view',
					criticalTasks: 'view',
					onboarding: 'view',
					ratingScheme: 'view'
				},
				scopeSet: { kind: 'organization' }
			}
		});
		loadWithContextMock.mockImplementationOnce(async (_locals, _cookies, _orgId, config) =>
			loadWithContextCore(ctx, config)
		);

		const result = await load({
			locals: {},
			cookies: {},
			parent: async () =>
				createReadyAppShellRouteData({
					orgId: 'org-1',
					orgName: 'Test Org',
					orgUrlSegment: 'test-org',
					role: 'owner'
				})
		} as never);

		expect(result).toMatchObject({
			orgId: 'org-1',
			orgUrlSegment: 'test-org',
			orgUrlSlug: 'test-org',
			orgName: 'Test Org',
			isAdmin: false,
			logsSettings: {
				sections: {
					logs: {
						auditLogPage: {
							items: [],
							page: 1,
							limit: 100,
							total: 0,
							totalPages: 0
						}
					}
				}
			}
		});
		expect(getAdminClientMock).toHaveBeenCalledOnce();
		expect(createSupabaseDataStoreMock).toHaveBeenCalledWith({ admin: true });
		expect(loadLogsSettingsMock).toHaveBeenCalledWith(expect.objectContaining({ auth: ctx.auth }), {
			store: 'admin-store'
		});
	});
});
