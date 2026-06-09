import { beforeEach, describe, expect, it, vi } from 'vitest';

const { platformAuditMock } = vi.hoisted(() => ({
	platformAuditMock: {
		listLogs: vi.fn(),
		listRecentByOrganization: vi.fn(),
		listRecentByUser: vi.fn()
	}
}));

vi.mock('$lib/server/adapters/adminAdapter', () => ({
	loadWithAdminContext: (config: { fn: (ctx: unknown, event: unknown) => unknown }) => (event: { __ctx: unknown }) =>
		config.fn(event.__ctx, event)
}));

vi.mock('$lib/server/adapters/supabasePlatformAudit', () => ({
	createSupabasePlatformAudit: () => platformAuditMock
}));

import { load } from './+page.server';

function makeContext() {
	return {
		adminClient: {
			from: vi.fn((table: string) => {
				if (table === 'audit_logs') throw new Error('route must use PlatformAudit');
				throw new Error(`Unexpected table ${table}`);
			})
		},
		adminUser: { id: 'admin-1', role: 'super_admin' },
		audit: vi.fn()
	};
}

describe('admin audit route', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		platformAuditMock.listLogs.mockResolvedValue({
			logs: [
				{
					id: 'log-1',
					userId: 'user-1',
					orgId: 'org-1',
					action: 'admin.org.gift_tier',
					resourceType: 'organization',
					resourceId: 'org-1',
					ipAddress: '203.0.113.10',
					details: { giftTier: 'team' },
					severity: 'warning',
					createdAt: '2026-06-08T15:00:00.000Z'
				}
			],
			totalCount: 1,
			page: 2,
			limit: 50,
			actionFilter: 'admin.org.gift_tier',
			severityFilter: 'warning',
			orgFilter: 'org-1',
			availableActions: ['admin.org.gift_tier']
		});
	});

	it('loads filtered audit logs through PlatformAudit', async () => {
		const result = await load({
			__ctx: makeContext(),
			url: new URL('http://localhost/admin/audit?page=2&action=admin.org.gift_tier&severity=warning&org=org-1')
		} as unknown as Parameters<typeof load>[0]);

		expect(platformAuditMock.listLogs).toHaveBeenCalledWith({
			page: 2,
			limit: 50,
			action: 'admin.org.gift_tier',
			severity: 'warning',
			orgId: 'org-1'
		});
		expect(result).toEqual({
			logs: [
				{
					id: 'log-1',
					userId: 'user-1',
					orgId: 'org-1',
					action: 'admin.org.gift_tier',
					resourceType: 'organization',
					resourceId: 'org-1',
					ipAddress: '203.0.113.10',
					details: { giftTier: 'team' },
					severity: 'warning',
					createdAt: '2026-06-08T15:00:00.000Z'
				}
			],
			totalCount: 1,
			page: 2,
			limit: 50,
			actionFilter: 'admin.org.gift_tier',
			severityFilter: 'warning',
			orgFilter: 'org-1',
			availableActions: ['admin.org.gift_tier']
		});
	});
});
