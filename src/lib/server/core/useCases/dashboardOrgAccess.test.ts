import { describe, expect, it, vi } from 'vitest';
import { createTestNotificationPort } from '$lib/server/adapters/inMemory';
import {
	acceptDashboardInvitation,
	declineDashboardInvitation,
	loadDashboardOrgAccess,
	type DashboardInvitationRecord,
	type DashboardMembershipCreateInput,
	type DashboardOrgAccessPort,
	type DashboardOrganizationSummary,
	type DashboardPendingInvitationSummary
} from './dashboardOrgAccess';

function buildInvitation(overrides: Partial<DashboardInvitationRecord> = {}): DashboardInvitationRecord {
	return {
		id: 'invite-1',
		organizationId: 'org-1',
		canViewCalendar: true,
		canEditCalendar: false,
		canViewPersonnel: true,
		canEditPersonnel: false,
		canViewTraining: true,
		canEditTraining: false,
		canViewCriticalTasks: true,
		canEditCriticalTasks: false,
		canViewOnboarding: false,
		canEditOnboarding: false,
		canViewLeadersBook: false,
		canEditLeadersBook: false,
		canManageMembers: false,
		...overrides
	};
}

function createDashboardOrgAccessPort(
	options: {
		organizations?: DashboardOrganizationSummary[];
		pendingInvitations?: DashboardPendingInvitationSummary[];
		invitation?: DashboardInvitationRecord | null;
		hasMembership?: boolean;
		createMembershipSucceeds?: boolean;
		deleteInvitationSucceeds?: boolean;
		declineSucceeds?: boolean;
	} = {}
): DashboardOrgAccessPort & {
	createdMemberships: DashboardMembershipCreateInput[];
	deletedInvitationIds: string[];
	declinedInvitations: Array<{ invitationId: string; email: string }>;
	requestedInvitationEmails: string[];
} {
	const createdMemberships: DashboardMembershipCreateInput[] = [];
	const deletedInvitationIds: string[] = [];
	const declinedInvitations: Array<{ invitationId: string; email: string }> = [];
	const requestedInvitationEmails: string[] = [];

	return {
		createdMemberships,
		deletedInvitationIds,
		declinedInvitations,
		requestedInvitationEmails,
		async listOrganizationsForUser() {
			return options.organizations ?? [];
		},
		async listPendingInvitationsForEmail(email) {
			requestedInvitationEmails.push(email);
			return options.pendingInvitations ?? [];
		},
		async findInvitation(invitationId, email) {
			requestedInvitationEmails.push(email);
			return options.invitation?.id === invitationId ? options.invitation : null;
		},
		async hasMembership() {
			return options.hasMembership ?? false;
		},
		async createMembership(input) {
			createdMemberships.push(input);
			return options.createMembershipSucceeds ?? true;
		},
		async deleteInvitation(invitationId) {
			deletedInvitationIds.push(invitationId);
			return options.deleteInvitationSucceeds ?? true;
		},
		async deleteInvitationForEmail(invitationId, email) {
			declinedInvitations.push({ invitationId, email });
			return options.declineSucceeds ?? true;
		}
	};
}

describe('loadDashboardOrgAccess', () => {
	it('redirects to the only organization when there are no pending invitations', async () => {
		const port = createDashboardOrgAccessPort({
			organizations: [{ id: 'org-1', name: 'Alpha Company', role: 'member' }]
		});

		const result = await loadDashboardOrgAccess(port, {
			userId: 'user-1',
			email: 'USER@EXAMPLE.COM',
			forceShow: false
		});

		expect(result).toEqual({
			organizations: [{ id: 'org-1', name: 'Alpha Company', role: 'member' }],
			pendingInvitations: [],
			redirectTo: '/org/org-1'
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
		const port = createDashboardOrgAccessPort();

		await expect(
			acceptDashboardInvitation(
				{ dashboard: port, notifications: createTestNotificationPort() },
				{ invitationId: 'missing', userId: 'user-1', email: 'user@example.com' }
			)
		).rejects.toMatchObject({
			status: 404,
			message: 'Invitation not found'
		});
	});

	it('deletes the invitation and preserves the current duplicate-membership failure', async () => {
		const port = createDashboardOrgAccessPort({
			invitation: buildInvitation(),
			hasMembership: true
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

		expect(port.deletedInvitationIds).toEqual(['invite-1']);
		expect(port.createdMemberships).toHaveLength(0);
	});

	it('creates an admin membership when every invitation permission is granted', async () => {
		const port = createDashboardOrgAccessPort({
			invitation: buildInvitation({
				canEditCalendar: true,
				canEditPersonnel: true,
				canViewTraining: true,
				canEditTraining: true,
				canViewCriticalTasks: true,
				canEditCriticalTasks: true,
				canViewOnboarding: true,
				canEditOnboarding: true,
				canViewLeadersBook: true,
				canEditLeadersBook: true,
				canManageMembers: true
			})
		});
		const notifications = createTestNotificationPort();

		const result = await acceptDashboardInvitation(
			{ dashboard: port, notifications },
			{ invitationId: 'invite-1', userId: 'user-1', email: 'USER@EXAMPLE.COM' }
		);

		expect(result).toEqual({ success: true, accepted: true });
		expect(port.createdMemberships).toEqual([
			expect.objectContaining({
				organizationId: 'org-1',
				userId: 'user-1',
				email: 'user@example.com',
				role: 'admin'
			})
		]);
		expect(port.deletedInvitationIds).toEqual(['invite-1']);
		expect(notifications.notifications).toEqual([
			{
				target: 'admins',
				orgId: 'org-1',
				excludeUserId: 'user-1',
				notification: {
					type: 'member_joined',
					title: 'New Member Joined',
					message: '"USER@EXAMPLE.COM" has joined the organization.',
					link: '/org/org-1/settings'
				}
			}
		]);
	});

	it('logs invitation cleanup failures after accepting while preserving the success response', async () => {
		const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const port = createDashboardOrgAccessPort({
			invitation: buildInvitation(),
			deleteInvitationSucceeds: false
		});

		const result = await acceptDashboardInvitation(
			{ dashboard: port, notifications: createTestNotificationPort() },
			{ invitationId: 'invite-1', userId: 'user-1', email: 'user@example.com' }
		);

		expect(result).toEqual({ success: true, accepted: true });
		expect(consoleErrorSpy).toHaveBeenCalledWith(
			'[dashboard-org-access]',
			expect.objectContaining({
				status: 'invitation-delete-failed',
				reason: 'accepted-membership-cleanup',
				invitationId: 'invite-1',
				organizationId: 'org-1',
				userId: 'user-1'
			})
		);
	});

	it('preserves the current membership defaults for nullable invitation flags', async () => {
		const port = createDashboardOrgAccessPort({
			invitation: buildInvitation({
				canViewCalendar: null,
				canEditCalendar: null,
				canViewPersonnel: null,
				canEditPersonnel: null,
				canViewTraining: null,
				canEditTraining: null,
				canViewCriticalTasks: null,
				canEditCriticalTasks: null,
				canViewOnboarding: null,
				canEditOnboarding: null,
				canViewLeadersBook: null,
				canEditLeadersBook: null,
				canManageMembers: null
			})
		});

		await acceptDashboardInvitation(
			{ dashboard: port, notifications: createTestNotificationPort() },
			{ invitationId: 'invite-1', userId: 'user-1', email: 'user@example.com' }
		);

		expect(port.createdMemberships).toEqual([
			{
				organizationId: 'org-1',
				userId: 'user-1',
				email: 'user@example.com',
				role: 'member',
				scopedGroupId: null,
				canViewCalendar: true,
				canEditCalendar: true,
				canViewPersonnel: true,
				canEditPersonnel: true,
				canViewTraining: true,
				canEditTraining: true,
				canViewCriticalTasks: true,
				canEditCriticalTasks: true,
				canViewOnboarding: true,
				canEditOnboarding: true,
				canViewRatingScheme: true,
				canEditRatingScheme: true,
				canViewLeadersBook: true,
				canEditLeadersBook: true,
				canManageMembers: false,
				memberPreset: null,
				capabilityOverrides: {},
				accessScopeKind: null,
				accessScopeGroupIds: []
			}
		]);
	});

	it('fails with the current generic error when membership creation fails', async () => {
		const port = createDashboardOrgAccessPort({
			invitation: buildInvitation(),
			createMembershipSucceeds: false
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
			email: 'USER@EXAMPLE.COM'
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
