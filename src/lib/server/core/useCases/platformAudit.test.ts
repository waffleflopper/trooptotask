import { describe, expect, it } from 'vitest';
import { createInMemoryPlatformAuditStore } from '$lib/server/adapters/inMemoryPlatformAudit';
import { createPlatformAudit } from './platformAudit';

describe('PlatformAudit', () => {
	it('returns a filtered audit log page with distinct actions', async () => {
		const audit = createPlatformAudit({
			store: createInMemoryPlatformAuditStore({
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
						timestamp: '2026-06-08T15:00:00.000Z'
					},
					{
						id: 'log-2',
						userId: 'user-2',
						orgId: 'org-1',
						action: 'admin.user.password_reset',
						resourceType: 'user',
						resourceId: 'user-2',
						ipAddress: null,
						details: null,
						severity: 'info',
						timestamp: '2026-06-08T14:00:00.000Z'
					},
					{
						id: 'log-3',
						userId: null,
						orgId: 'org-2',
						action: 'admin.org.gift_tier',
						resourceType: 'organization',
						resourceId: 'org-2',
						ipAddress: null,
						details: null,
						severity: 'critical',
						timestamp: '2026-06-08T13:00:00.000Z'
					}
				]
			})
		});

		const result = await audit.listLogs({
			page: 1,
			limit: 1,
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
			page: 1,
			limit: 1,
			actionFilter: 'admin.org.gift_tier',
			severityFilter: 'warning',
			orgFilter: 'org-1',
			availableActions: ['admin.org.gift_tier', 'admin.user.password_reset']
		});
	});

	it('paginates newest-first audit logs through the public interface', async () => {
		const audit = createPlatformAudit({
			store: createInMemoryPlatformAuditStore({
				logs: [
					{
						id: 'newest',
						userId: 'user-1',
						orgId: 'org-1',
						action: 'admin.org.gift_tier',
						resourceType: 'organization',
						resourceId: 'org-1',
						ipAddress: null,
						details: null,
						severity: 'warning',
						timestamp: '2026-06-08T17:00:00.000Z'
					},
					{
						id: 'middle',
						userId: 'user-2',
						orgId: 'org-2',
						action: 'admin.user.password_reset',
						resourceType: 'user',
						resourceId: 'user-2',
						ipAddress: null,
						details: null,
						severity: 'info',
						timestamp: '2026-06-08T16:00:00.000Z'
					},
					{
						id: 'oldest',
						userId: null,
						orgId: null,
						action: 'admin.audit.review',
						resourceType: null,
						resourceId: null,
						ipAddress: null,
						details: null,
						severity: 'info',
						timestamp: '2026-06-08T15:00:00.000Z'
					}
				]
			})
		});

		const result = await audit.listLogs({ page: 2, limit: 1 });

		expect(result.logs.map((log) => log.id)).toEqual(['middle']);
		expect(result.totalCount).toBe(3);
		expect(result.page).toBe(2);
	});

	it('returns recent activity for organization and user detail pages', async () => {
		const audit = createPlatformAudit({
			store: createInMemoryPlatformAuditStore({
				logs: [
					{
						id: 'org-new',
						userId: 'user-1',
						orgId: 'org-1',
						action: 'admin.org.extend_gift',
						resourceType: 'organization',
						resourceId: 'org-1',
						ipAddress: null,
						details: null,
						severity: 'info',
						timestamp: '2026-06-08T16:00:00.000Z'
					},
					{
						id: 'user-new',
						userId: 'user-2',
						orgId: 'org-2',
						action: 'admin.user.resend_invite',
						resourceType: 'user',
						resourceId: 'user-2',
						ipAddress: null,
						details: { invitation: 'resent' },
						severity: 'warning',
						timestamp: '2026-06-08T15:00:00.000Z'
					},
					{
						id: 'org-old',
						userId: 'user-3',
						orgId: 'org-1',
						action: 'admin.org.revoke_gift',
						resourceType: 'organization',
						resourceId: 'org-1',
						ipAddress: null,
						details: null,
						severity: 'critical',
						timestamp: '2026-06-08T14:00:00.000Z'
					}
				]
			})
		});

		await expect(audit.listRecentByOrganization({ orgId: 'org-1', limit: 1 })).resolves.toEqual([
			{
				id: 'org-new',
				action: 'admin.org.extend_gift',
				userId: 'user-1',
				timestamp: '2026-06-08T16:00:00.000Z',
				severity: 'info',
				resourceType: 'organization',
				resourceId: 'org-1'
			}
		]);
		await expect(audit.listRecentByUser({ userId: 'user-2', limit: 1 })).resolves.toEqual([
			{
				id: 'user-new',
				action: 'admin.user.resend_invite',
				resourceType: 'user',
				resourceId: 'user-2',
				orgId: 'org-2',
				timestamp: '2026-06-08T15:00:00.000Z',
				severity: 'warning'
			}
		]);
	});
});
