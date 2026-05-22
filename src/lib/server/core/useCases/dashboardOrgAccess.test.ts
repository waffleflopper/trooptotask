import { describe, expect, it, vi } from 'vitest';
import { createTestNotificationPort } from '$lib/server/adapters/inMemory';
import {
	acceptDashboardInvitation,
	declineDashboardInvitation,
	loadDashboardOrgAccess,
	type DashboardInvitationAcceptResult,
	type DashboardOrgAccessPort,
	type DashboardOrganizationSummary,
	type DashboardPendingInvitationSummary
} from './dashboardOrgAccess';

function createDashboardOrgAccessPort(
	options: {
		organizations?: DashboardOrganizationSummary[];
		pendingInvitations?: DashboardPendingInvitationSummary[];
		acceptResult?: DashboardInvitationAcceptResult;
		declineSucceeds?: boolean;
	} = {}
): DashboardOrgAccessPort & {
	deletedInvitationIds: string[];
	declinedInvitations: Array<{ invitationId: string; email: string }>;
	requestedInvitationEmails: string[];
	acceptedInvitations: Array<{ invitationId: string; userId: string; email: string }>;
} {
	const deletedInvitationIds: string[] = [];
	const declinedInvitations: Array<{ invitationId: string; email: string }> = [];
	const requestedInvitationEmails: string[] = [];
	const acceptedInvitations: Array<{ invitationId: string; userId: string; email: string }> = [];

	return {
		deletedInvitationIds,
		declinedInvitations,
		requestedInvitationEmails,
		acceptedInvitations,
		async listOrganizationsForUser() {
			return options.organizations ?? [];
		},
		async listPendingInvitationsForEmail(email) {
			requestedInvitationEmails.push(email);
			return options.pendingInvitations ?? [];
		},
		async acceptInvitation(input) {
			acceptedInvitations.push(input);
			return options.acceptResult ?? { status: 'accepted', organizationId: 'org-1' };
		},
		async deleteInvitationForEmail(invitationId, email) {
			declinedInvitations.push({ invitationId, email });
			return options.declineSucceeds ?? true;
		}
	};
}

describe('loadDashboardOrgAccess', () => {
	it('redirects to the only organization preferred URL segment when there are no pending invitations', async () => {
		const port = createDashboardOrgAccessPort({
			organizations: [{ id: 'org-1', name: 'Alpha Company', role: 'member', urlSegment: '1-11-bde' }]
		});

		const result = await loadDashboardOrgAccess(port, {
			userId: 'user-1',
			email: ' USER@EXAMPLE.COM ',
			forceShow: false
		});

		expect(result).toEqual({
			organizations: [{ id: 'org-1', name: 'Alpha Company', role: 'member', urlSegment: '1-11-bde' }],
			pendingInvitations: [],
			redirectTo: '/org/1-11-bde'
		});
		expect(port.requestedInvitationEmails).toEqual(['user@example.com']);
	});

	it('redirects to organization creation when the user has no orgs and no invitations', async () => {
		const result = await loadDashboardOrgAccess(createDashboardOrgAccessPort(), {
			userId: 'user-1',
			email: 'user@example.com',
			forceShow: false
		});

		expect(result.redirectTo).toBe('/org/new');
	});

	it('keeps the dashboard visible when show=all is forced', async () => {
		const port = createDashboardOrgAccessPort({
			organizations: [{ id: 'org-1', name: 'Alpha Company', role: 'admin' }]
		});

		const result = await loadDashboardOrgAccess(port, {
			userId: 'user-1',
			email: 'user@example.com',
			forceShow: true
		});

		expect(result).toEqual({
			organizations: [{ id: 'org-1', name: 'Alpha Company', role: 'admin' }],
			pendingInvitations: [],
			redirectTo: null
		});
	});

	it('keeps the dashboard visible when multiple organizations or invitations remain', async () => {
		const port = createDashboardOrgAccessPort({
			organizations: [
				{ id: 'org-1', name: 'Alpha Company', role: 'admin' },
				{ id: 'org-2', name: 'Bravo Company', role: 'member' }
			],
			pendingInvitations: [
				{
					id: 'invite-1',
					organizationId: 'org-3',
					organizationName: 'Charlie Company',
					createdAt: '2026-04-23T00:00:00.000Z'
				}
			]
		});

		const result = await loadDashboardOrgAccess(port, {
			userId: 'user-1',
			email: 'user@example.com',
			forceShow: false
		});

		expect(result).toEqual({
			organizations: [
				{ id: 'org-1', name: 'Alpha Company', role: 'admin' },
				{ id: 'org-2', name: 'Bravo Company', role: 'member' }
			],
			pendingInvitations: [
				{
					id: 'invite-1',
					organizationId: 'org-3',
					organizationName: 'Charlie Company',
					createdAt: '2026-04-23T00:00:00.000Z'
				}
			],
			redirectTo: null
		});
	});
});

describe('acceptDashboardInvitation', () => {
	it('fails when the invitation cannot be found for the current user email', async () => {
		const port = createDashboardOrgAccessPort({
			acceptResult: { status: 'not_found', organizationId: null }
		});

		await expect(
			acceptDashboardInvitation(
				{ dashboard: port, notifications: createTestNotificationPort() },
				{ invitationId: 'missing', userId: 'user-1', email: 'user@example.com' }
			)
		).rejects.toMatchObject({
			status: 404,
			message: 'Invitation not found'
		});
		expect(port.acceptedInvitations).toEqual([
			{ invitationId: 'missing', userId: 'user-1', email: 'user@example.com' }
		]);
	});

	it('preserves the duplicate-membership failure without deleting invitation history', async () => {
		const port = createDashboardOrgAccessPort({
			acceptResult: { status: 'already_member', organizationId: 'org-1' }
		});

		await expect(
			acceptDashboardInvitation(
				{ dashboard: port, notifications: createTestNotificationPort() },
				{ invitationId: 'invite-1', userId: 'user-1', email: 'user@example.com' }
			)
		).rejects.toMatchObject({
			status: 400,
			message: 'You are already a member of this organization'
		});

		expect(port.deletedInvitationIds).toEqual([]);
	});

	it('returns an expired-invitation failure from the acceptance transition', async () => {
		const port = createDashboardOrgAccessPort({
			acceptResult: { status: 'expired', organizationId: 'org-1' }
		});

		await expect(
			acceptDashboardInvitation(
				{ dashboard: port, notifications: createTestNotificationPort() },
				{ invitationId: 'invite-1', userId: 'user-1', email: 'user@example.com' }
			)
		).rejects.toMatchObject({
			status: 400,
			message: 'Invitation has expired'
		});

		expect(port.deletedInvitationIds).toEqual([]);
	});

	it('returns a deterministic already-accepted failure for double accepts', async () => {
		const port = createDashboardOrgAccessPort({
			acceptResult: { status: 'already_accepted', organizationId: 'org-1' }
		});

		await expect(
			acceptDashboardInvitation(
				{ dashboard: port, notifications: createTestNotificationPort() },
				{ invitationId: 'invite-1', userId: 'user-1', email: 'user@example.com' }
			)
		).rejects.toMatchObject({
			status: 400,
			message: 'Invitation has already been accepted'
		});

		expect(port.deletedInvitationIds).toEqual([]);
	});

	it('accepts through the atomic transition and notifies admins', async () => {
		const port = createDashboardOrgAccessPort({
			acceptResult: { status: 'accepted', organizationId: 'org-1' }
		});
		const notifications = createTestNotificationPort();

		const result = await acceptDashboardInvitation(
			{ dashboard: port, notifications },
			{ invitationId: 'invite-1', userId: 'user-1', email: ' USER@EXAMPLE.COM ' }
		);

		expect(result).toEqual({ success: true, accepted: true });
		expect(port.acceptedInvitations).toEqual([
			{ invitationId: 'invite-1', userId: 'user-1', email: 'user@example.com' }
		]);
		expect(port.deletedInvitationIds).toEqual([]);
		expect(notifications.notifications).toEqual([
			{
				target: 'admins',
				orgId: 'org-1',
				excludeUserId: 'user-1',
				notification: {
					type: 'member_joined',
					title: 'New Member Joined',
					message: '"user@example.com" has joined the organization.',
					link: '/org/org-1/settings'
				}
			}
		]);
	});

	it('keeps accepted response when governor notification delivery fails after the transition committed', async () => {
		const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const port = createDashboardOrgAccessPort({
			acceptResult: { status: 'accepted', organizationId: 'org-1' }
		});
		const notifications = createTestNotificationPort();
		vi.spyOn(notifications, 'notifyAdmins').mockRejectedValue(new Error('notification unavailable'));

		const result = await acceptDashboardInvitation(
			{ dashboard: port, notifications },
			{ invitationId: 'invite-1', userId: 'user-1', email: ' USER@EXAMPLE.COM ' }
		);

		expect(result).toEqual({ success: true, accepted: true });
		expect(consoleErrorSpy).toHaveBeenCalledWith(
			'[dashboard-org-access]',
			expect.objectContaining({
				status: 'accepted-notification-failed',
				organizationId: 'org-1',
				userId: 'user-1'
			})
		);

		consoleErrorSpy.mockRestore();
	});

	it('fails with the current generic error when membership creation fails', async () => {
		const port = createDashboardOrgAccessPort({
			acceptResult: { status: 'failed', organizationId: null }
		});

		await expect(
			acceptDashboardInvitation(
				{ dashboard: port, notifications: createTestNotificationPort() },
				{ invitationId: 'invite-1', userId: 'user-1', email: 'user@example.com' }
			)
		).rejects.toMatchObject({
			status: 500,
			message: 'Failed to accept invitation'
		});
	});
});

describe('declineDashboardInvitation', () => {
	it('deletes the invitation for the current email and returns the success payload', async () => {
		const port = createDashboardOrgAccessPort();

		const result = await declineDashboardInvitation(port, {
			invitationId: 'invite-1',
			email: ' USER@EXAMPLE.COM '
		});

		expect(result).toEqual({ success: true, declined: true });
		expect(port.declinedInvitations).toEqual([{ invitationId: 'invite-1', email: 'user@example.com' }]);
	});

	it('fails with the current generic error when the decline delete errors', async () => {
		const port = createDashboardOrgAccessPort({ declineSucceeds: false });

		await expect(
			declineDashboardInvitation(port, {
				invitationId: 'invite-1',
				email: 'user@example.com'
			})
		).rejects.toMatchObject({
			status: 500,
			message: 'Failed to decline invitation'
		});
	});
});
