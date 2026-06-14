import { describe, expect, it, vi } from 'vitest';
import { createTestNotificationPort } from '$lib/server/adapters/inMemory';
import type { AuditPort } from '$lib/server/core/ports';
import {
	acceptDashboardInvitation,
	declineDashboardInvitation,
	loadDashboardOrgAccess,
	type DashboardInvitationAcceptResult,
	type DashboardInvitationDeclineResult,
	type DashboardOrgAccessPort,
	type DashboardOrganizationSummary,
	type DashboardPendingInvitationSummary
} from './dashboardOrgAccess';

function createDashboardOrgAccessPort(
	options: {
		organizations?: DashboardOrganizationSummary[];
		pendingInvitations?: DashboardPendingInvitationSummary[];
		acceptResult?: DashboardInvitationAcceptResult;
		declineResult?: DashboardInvitationDeclineResult;
	} = {}
): DashboardOrgAccessPort & {
	deletedInvitationIds: string[];
	declinedInvitations: Array<{ invitationId: string; userId: string; email: string }>;
	requestedInvitationEmails: string[];
	acceptedInvitations: Array<{ invitationId: string; userId: string; email: string }>;
} {
	const deletedInvitationIds: string[] = [];
	const declinedInvitations: Array<{ invitationId: string; userId: string; email: string }> = [];
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
		async declineInvitation(input) {
			declinedInvitations.push(input);
			return options.declineResult ?? { status: 'declined', organizationId: 'org-1' };
		}
	};
}

function createDeferred<T>() {
	let resolve!: (value: T | PromiseLike<T>) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});

	return { promise, resolve, reject };
}

function createRecordingAuditFactory(): {
	auditFor: (organizationId: string) => AuditPort;
	events: Array<{ organizationId: string; event: Parameters<AuditPort['log']>[0] }>;
} {
	const events: Array<{ organizationId: string; event: Parameters<AuditPort['log']>[0] }> = [];

	return {
		events,
		auditFor: (organizationId) => ({
			log(event) {
				events.push({ organizationId, event });
			}
		})
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

	it('starts organization and invitation reads before either resolves', async () => {
		const events: string[] = [];
		const organizationsRead = createDeferred<DashboardOrganizationSummary[]>();
		const invitationsRead = createDeferred<DashboardPendingInvitationSummary[]>();
		const port: DashboardOrgAccessPort = {
			async listOrganizationsForUser() {
				events.push('organizations:start');
				return organizationsRead.promise;
			},
			async listPendingInvitationsForEmail(email) {
				events.push(`invitations:start:${email}`);
				return invitationsRead.promise;
			},
			async acceptInvitation() {
				throw new Error('acceptInvitation should not be called');
			},
			async declineInvitation() {
				throw new Error('declineInvitation should not be called');
			}
		};

		const resultPromise = loadDashboardOrgAccess(port, {
			userId: 'user-1',
			email: ' USER@EXAMPLE.COM ',
			forceShow: true
		});

		await Promise.resolve();

		try {
			expect(events).toEqual(['organizations:start', 'invitations:start:user@example.com']);
		} finally {
			organizationsRead.resolve([]);
			invitationsRead.resolve([]);
			await resultPromise;
		}
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
		const notifications = createTestNotificationPort();

		await expect(
			acceptDashboardInvitation(
				{ dashboard: port, notifications },
				{ invitationId: 'invite-1', userId: 'user-1', email: 'user@example.com' }
			)
		).rejects.toMatchObject({
			status: 400,
			message: 'Invitation has expired'
		});

		expect(port.deletedInvitationIds).toEqual([]);
		expect(notifications.notifications).toEqual([
			{
				target: 'admins',
				orgId: 'org-1',
				excludeUserId: 'user-1',
				notification: {
					type: 'member_invite_expired',
					title: 'Invitation Expired',
					message: '"user@example.com" tried to use an expired organization invitation.',
					link: '/org/org-1/settings'
				}
			}
		]);
	});

	it('requires completed account setup before accepting an invitation linked from an Access Request', async () => {
		const port = createDashboardOrgAccessPort({
			acceptResult: { status: 'setup_required', organizationId: null }
		});

		await expect(
			acceptDashboardInvitation(
				{ dashboard: port, notifications: createTestNotificationPort() },
				{ invitationId: 'invite-1', userId: 'user-1', email: 'user@example.com' }
			)
		).rejects.toMatchObject({
			status: 400,
			message: 'Complete account setup before accepting this organization invitation'
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

	it('returns a clear blocked failure when platform access rejection blocks acceptance', async () => {
		const port = createDashboardOrgAccessPort({
			acceptResult: { status: 'blocked', organizationId: 'org-1' }
		});

		await expect(
			acceptDashboardInvitation(
				{ dashboard: port, notifications: createTestNotificationPort() },
				{ invitationId: 'invite-1', userId: 'user-1', email: 'user@example.com' }
			)
		).rejects.toMatchObject({
			status: 400,
			message: 'This organization invitation is no longer available because platform access was rejected'
		});

		expect(port.deletedInvitationIds).toEqual([]);
	});

	it('accepts through the atomic transition and notifies admins', async () => {
		const port = createDashboardOrgAccessPort({
			acceptResult: { status: 'accepted', organizationId: 'org-1' }
		});
		const notifications = createTestNotificationPort();
		const audit = createRecordingAuditFactory();

		const result = await acceptDashboardInvitation(
			{ dashboard: port, notifications, audit: audit.auditFor },
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
		expect(audit.events).toEqual([
			{
				organizationId: 'org-1',
				event: {
					action: 'organization_invitation.accepted',
					resourceType: 'organization_invitation',
					resourceId: 'invite-1',
					details: {
						organizationId: 'org-1',
						userId: 'user-1',
						stateTransition: 'pending.accepted'
					}
				}
			}
		]);
		const auditPayload = JSON.stringify(audit.events);
		expect(auditPayload).not.toContain('USER@EXAMPLE.COM');
		expect(auditPayload).not.toContain('user@example.com');
		expect(auditPayload).not.toContain('/auth/setup-account?token=');
		expect(auditPayload).not.toContain('password');
		expect(auditPayload).not.toContain('service_role');
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
	it('marks the invitation declined for the authenticated invitee and notifies admins', async () => {
		const port = createDashboardOrgAccessPort();
		const notifications = createTestNotificationPort();
		const audit = createRecordingAuditFactory();

		const result = await declineDashboardInvitation(
			{ dashboard: port, notifications, audit: audit.auditFor },
			{
				invitationId: 'invite-1',
				userId: 'user-1',
				email: ' USER@EXAMPLE.COM '
			}
		);

		expect(result).toEqual({ success: true, declined: true });
		expect(port.declinedInvitations).toEqual([
			{ invitationId: 'invite-1', userId: 'user-1', email: 'user@example.com' }
		]);
		expect(port.deletedInvitationIds).toEqual([]);
		expect(notifications.notifications).toEqual([
			{
				target: 'admins',
				orgId: 'org-1',
				excludeUserId: 'user-1',
				notification: {
					type: 'member_invite_declined',
					title: 'Invitation Declined',
					message: '"user@example.com" declined their organization invitation.',
					link: '/org/org-1/settings'
				}
			}
		]);
		expect(audit.events).toEqual([
			{
				organizationId: 'org-1',
				event: {
					action: 'organization_invitation.declined',
					resourceType: 'organization_invitation',
					resourceId: 'invite-1',
					details: {
						organizationId: 'org-1',
						userId: 'user-1',
						stateTransition: 'pending.declined'
					}
				}
			}
		]);
		const auditPayload = JSON.stringify(audit.events);
		expect(auditPayload).not.toContain('USER@EXAMPLE.COM');
		expect(auditPayload).not.toContain('user@example.com');
		expect(auditPayload).not.toContain('/auth/setup-account?token=');
		expect(auditPayload).not.toContain('password');
		expect(auditPayload).not.toContain('service_role');
	});

	it('fails when the decline transition cannot find an invitation for the current email', async () => {
		const port = createDashboardOrgAccessPort({ declineResult: { status: 'not_found', organizationId: null } });

		await expect(
			declineDashboardInvitation(
				{ dashboard: port, notifications: createTestNotificationPort() },
				{
					invitationId: 'invite-1',
					userId: 'user-1',
					email: 'user@example.com'
				}
			)
		).rejects.toMatchObject({
			status: 404,
			message: 'Invitation not found'
		});
	});

	it('returns a clear expired state instead of deleting invitation history', async () => {
		const port = createDashboardOrgAccessPort({ declineResult: { status: 'expired', organizationId: 'org-1' } });
		const notifications = createTestNotificationPort();

		await expect(
			declineDashboardInvitation(
				{ dashboard: port, notifications },
				{
					invitationId: 'invite-1',
					userId: 'user-1',
					email: 'user@example.com'
				}
			)
		).rejects.toMatchObject({
			status: 400,
			message: 'Invitation has expired'
		});
		expect(port.deletedInvitationIds).toEqual([]);
		expect(notifications.notifications).toEqual([
			{
				target: 'admins',
				orgId: 'org-1',
				excludeUserId: 'user-1',
				notification: {
					type: 'member_invite_expired',
					title: 'Invitation Expired',
					message: '"user@example.com" tried to use an expired organization invitation.',
					link: '/org/org-1/settings'
				}
			}
		]);
	});

	it.each([
		['already_accepted', 'Invitation has already been accepted'],
		['already_declined', 'Invitation has already been declined'],
		['revoked', 'Invitation has been revoked'],
		['blocked', 'This organization invitation is no longer available because platform access was rejected']
	] as const)('maps %s decline statuses to deterministic action failures', async (status, message) => {
		const port = createDashboardOrgAccessPort({ declineResult: { status, organizationId: 'org-1' } });

		await expect(
			declineDashboardInvitation(
				{ dashboard: port, notifications: createTestNotificationPort() },
				{
					invitationId: 'invite-1',
					userId: 'user-1',
					email: 'user@example.com'
				}
			)
		).rejects.toMatchObject({
			status: 400,
			message
		});
	});

	it('keeps declined response when governor notification delivery fails after the transition committed', async () => {
		const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const port = createDashboardOrgAccessPort();
		const notifications = createTestNotificationPort();
		vi.spyOn(notifications, 'notifyAdmins').mockRejectedValue(new Error('notification unavailable'));

		const result = await declineDashboardInvitation(
			{ dashboard: port, notifications },
			{
				invitationId: 'invite-1',
				userId: 'user-1',
				email: ' USER@EXAMPLE.COM '
			}
		);

		expect(result).toEqual({ success: true, declined: true });
		expect(consoleErrorSpy).toHaveBeenCalledWith(
			'[dashboard-org-access]',
			expect.objectContaining({
				status: 'declined-notification-failed',
				organizationId: 'org-1',
				userId: 'user-1'
			})
		);

		consoleErrorSpy.mockRestore();
	});

	it('fails with the current generic error when the decline transition fails', async () => {
		const port = createDashboardOrgAccessPort({ declineResult: { status: 'failed', organizationId: null } });

		await expect(
			declineDashboardInvitation(
				{ dashboard: port, notifications: createTestNotificationPort() },
				{
					invitationId: 'invite-1',
					userId: 'user-1',
					email: 'user@example.com'
				}
			)
		).rejects.toMatchObject({
			status: 500,
			message: 'Failed to decline invitation'
		});
	});
});
