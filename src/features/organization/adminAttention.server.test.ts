import { describe, expect, it, vi } from 'vitest';
import { createTestAuthContext } from '$lib/server/adapters/inMemory';
import { readAdminAttention, readAdminAttentionSnapshot, type AdminAttentionContext } from './adminAttention.server';
import type { OrganizationPendingInvitationFact } from './organizationSettingsTypes';

const NOW = new Date('2026-06-10T12:00:00.000Z');
const HOUR = 3_600_000;
const at = (hoursFromNow: number) => new Date(NOW.getTime() + hoursFromNow * HOUR).toISOString();

function invitation(
	id: string,
	hoursFromNow: number,
	latestDeliveryStatus: OrganizationPendingInvitationFact['latestDeliveryStatus'] = 'sent'
): OrganizationPendingInvitationFact {
	return { id, email: `${id}@example.invalid`, expiresAt: at(hoursFromNow), latestDeliveryStatus };
}

function context(
	facts: OrganizationPendingInvitationFact[],
	overrides: Partial<AdminAttentionContext> = {}
): AdminAttentionContext {
	return {
		auth: createTestAuthContext({ role: 'admin', orgId: 'org-1' }),
		audit: { log: vi.fn(async () => {}) },
		organizationSettings: { listUnexpiredPendingInvitations: vi.fn(async () => facts) },
		readPendingApprovals: async () => [],
		...overrides
	};
}

describe('admin attention invitations', () => {
	it('lists a failed delivery and an invitation expiring within three days, ordered by expiry', async () => {
		const { invitations } = readAdminAttention(
			context([
				invitation('expiring', 70),
				invitation('failed', 200, 'failed'),
				invitation('soon-and-failed', 20, 'failed'),
				invitation('comfortable', 200)
			]),
			NOW
		);

		expect(await invitations).toEqual({
			pending: 4,
			attention: [
				{
					id: 'soon-and-failed',
					email: 'soon-and-failed@example.invalid',
					expiresAt: at(20),
					reason: 'deliveryFailed'
				},
				{ id: 'expiring', email: 'expiring@example.invalid', expiresAt: at(70), reason: 'expiringSoon' },
				{ id: 'failed', email: 'failed@example.invalid', expiresAt: at(200), reason: 'deliveryFailed' }
			]
		});
	});

	it('gives a failed delivery one row even when it is also about to expire', async () => {
		const { invitations } = readAdminAttention(context([invitation('both', 10, 'failed')]), NOW);

		expect((await invitations).attention.map((row) => row.reason)).toEqual(['deliveryFailed']);
	});

	it('treats exactly three days as expiring soon and a minute past it as not', async () => {
		const { invitations } = readAdminAttention(
			context([invitation('edge', 72), invitation('past-edge', 72 + 1 / 60)]),
			NOW
		);

		expect((await invitations).attention.map((row) => row.id)).toEqual(['edge']);
	});

	it('asks the reader for invitations that have not expired as of now, so none produce rows or a count', async () => {
		const ctx = context([]);
		await readAdminAttention(ctx, NOW).invitations;

		expect(ctx.organizationSettings.listUnexpiredPendingInvitations).toHaveBeenCalledWith('org-1', NOW);
	});

	it('refuses a member before reading any invitation', async () => {
		const ctx = context([invitation('one', 10)], {
			auth: createTestAuthContext({ role: 'member', isPrivileged: false, canManageMembers: false, orgId: 'org-1' })
		});

		await expect(readAdminAttention(ctx, NOW).invitations).rejects.toMatchObject({ status: 403 });
		expect(ctx.organizationSettings.listUnexpiredPendingInvitations).not.toHaveBeenCalled();
	});
});

describe('admin attention halves', () => {
	it('lets the invitation half settle when the approval half fails', async () => {
		const { approvals, invitations } = readAdminAttention(
			context([invitation('one', 10)], {
				readPendingApprovals: async () => {
					throw new Error('Approvals unavailable');
				}
			}),
			NOW
		);

		await expect(approvals).rejects.toThrow('Approvals unavailable');
		await expect(invitations).resolves.toMatchObject({ pending: 1 });
	});

	it('fails the snapshot when either half fails, since the Dashboard shows them as one source', async () => {
		const ctx = context([], {
			readPendingApprovals: async () => {
				throw new Error('Approvals unavailable');
			}
		});

		await expect(readAdminAttentionSnapshot(ctx, NOW)).rejects.toThrow('Approvals unavailable');
	});

	it('flattens the snapshot to approvals and the invitations that need attention', async () => {
		const groups = [{ kind: 'deletion', count: 1, oldestCreatedAt: '2026-06-05T00:00:00Z' }] as const;
		const snapshot = await readAdminAttentionSnapshot(
			context([invitation('failed', 100, 'failed'), invitation('fine', 100)], {
				readPendingApprovals: async () => groups
			}),
			NOW
		);

		expect(snapshot).toEqual({
			approvals: groups,
			invitations: [{ id: 'failed', email: 'failed@example.invalid', expiresAt: at(100), reason: 'deliveryFailed' }]
		});
	});
});
