import type { NotificationPort } from '$lib/server/core/ports';
import { fail } from '$lib/server/core/errors';
import { normalizeInvitationEmail } from './invitationEmail';

export interface DashboardOrganizationSummary {
	id: string;
	name: string;
	role: string;
	urlSegment?: string;
}

export interface DashboardPendingInvitationSummary {
	id: string;
	organizationId: string;
	organizationName: string;
	createdAt: string;
}

export type DashboardInvitationAcceptStatus =
	| 'accepted'
	| 'not_found'
	| 'expired'
	| 'already_member'
	| 'already_accepted'
	| 'failed';

export type DashboardInvitationDeclineStatus =
	| 'declined'
	| 'not_found'
	| 'expired'
	| 'already_accepted'
	| 'already_declined'
	| 'revoked'
	| 'failed';

export interface DashboardInvitationAcceptInput {
	invitationId: string;
	userId: string;
	email: string;
}

export interface DashboardInvitationAcceptResult {
	status: DashboardInvitationAcceptStatus;
	organizationId: string | null;
}

export interface DashboardInvitationDeclineInput {
	invitationId: string;
	userId: string;
	email: string;
}

export interface DashboardInvitationDeclineResult {
	status: DashboardInvitationDeclineStatus;
	organizationId: string | null;
}

export interface DashboardOrgAccessPort {
	listOrganizationsForUser(userId: string): Promise<DashboardOrganizationSummary[]>;
	listPendingInvitationsForEmail(email: string): Promise<DashboardPendingInvitationSummary[]>;
	acceptInvitation(input: DashboardInvitationAcceptInput): Promise<DashboardInvitationAcceptResult>;
	declineInvitation(input: DashboardInvitationDeclineInput): Promise<DashboardInvitationDeclineResult>;
}

export interface DashboardOrgAccessResult {
	organizations: DashboardOrganizationSummary[];
	pendingInvitations: DashboardPendingInvitationSummary[];
	redirectTo: string | null;
}

interface DashboardOrgAccessInput {
	userId: string;
	email?: string | null;
	forceShow: boolean;
}

interface AcceptDashboardInvitationPorts {
	dashboard: DashboardOrgAccessPort;
	notifications: NotificationPort;
}

interface AcceptDashboardInvitationInput {
	invitationId: string;
	userId: string;
	email?: string | null;
}

interface DeclineDashboardInvitationPorts {
	dashboard: DashboardOrgAccessPort;
	notifications: NotificationPort;
}

interface DeclineDashboardInvitationInput {
	invitationId: string;
	userId: string;
	email?: string | null;
}

export async function loadDashboardOrgAccess(
	port: DashboardOrgAccessPort,
	input: DashboardOrgAccessInput
): Promise<DashboardOrgAccessResult> {
	const organizations = await port.listOrganizationsForUser(input.userId);
	const pendingInvitations = await port.listPendingInvitationsForEmail(normalizeEmail(input.email));

	if (!input.forceShow && organizations.length === 1 && pendingInvitations.length === 0) {
		return {
			organizations,
			pendingInvitations,
			redirectTo: `/org/${organizations[0].urlSegment ?? organizations[0].id}`
		};
	}

	if (!input.forceShow && organizations.length === 0 && pendingInvitations.length === 0) {
		return {
			organizations,
			pendingInvitations,
			redirectTo: '/org/new'
		};
	}

	return {
		organizations,
		pendingInvitations,
		redirectTo: null
	};
}

export async function acceptDashboardInvitation(
	ports: AcceptDashboardInvitationPorts,
	input: AcceptDashboardInvitationInput
): Promise<{ success: true; accepted: true }> {
	const normalizedEmail = normalizeEmail(input.email);
	const accepted = await ports.dashboard.acceptInvitation({
		invitationId: input.invitationId,
		userId: input.userId,
		email: normalizedEmail
	});

	if (accepted.status === 'not_found') {
		fail(404, 'Invitation not found');
	}
	if (accepted.status === 'expired') {
		fail(400, 'Invitation has expired');
	}
	if (accepted.status === 'already_member') {
		fail(400, 'You are already a member of this organization');
	}
	if (accepted.status === 'already_accepted') {
		fail(400, 'Invitation has already been accepted');
	}
	if (accepted.status !== 'accepted' || !accepted.organizationId) {
		fail(500, 'Failed to accept invitation');
	}

	await notifyAdminsOfAcceptedInvitation(ports, {
		organizationId: accepted.organizationId,
		userId: input.userId,
		email: normalizedEmail
	});

	return { success: true, accepted: true };
}

export async function declineDashboardInvitation(
	ports: DeclineDashboardInvitationPorts,
	input: DeclineDashboardInvitationInput
): Promise<{ success: true; declined: true }> {
	const normalizedEmail = normalizeEmail(input.email);
	const declined = await ports.dashboard.declineInvitation({
		invitationId: input.invitationId,
		userId: input.userId,
		email: normalizedEmail
	});

	if (declined.status === 'not_found') {
		fail(404, 'Invitation not found');
	}
	if (declined.status === 'expired') {
		fail(400, 'Invitation has expired');
	}
	if (declined.status === 'already_accepted') {
		fail(400, 'Invitation has already been accepted');
	}
	if (declined.status === 'already_declined') {
		fail(400, 'Invitation has already been declined');
	}
	if (declined.status === 'revoked') {
		fail(400, 'Invitation has been revoked');
	}
	if (declined.status !== 'declined' || !declined.organizationId) {
		fail(500, 'Failed to decline invitation');
	}

	await notifyAdminsOfDeclinedInvitation(ports, {
		organizationId: declined.organizationId,
		userId: input.userId,
		email: normalizedEmail
	});

	return { success: true, declined: true };
}

function normalizeEmail(email?: string | null): string {
	return normalizeInvitationEmail(email);
}

async function notifyAdminsOfAcceptedInvitation(
	ports: AcceptDashboardInvitationPorts,
	input: { organizationId: string; userId: string; email: string }
): Promise<void> {
	try {
		await ports.notifications.notifyAdmins(input.organizationId, input.userId, {
			type: 'member_joined',
			title: 'New Member Joined',
			message: `"${input.email}" has joined the organization.`,
			link: `/org/${input.organizationId}/settings`
		});
	} catch (error) {
		console.error('[dashboard-org-access]', {
			status: 'accepted-notification-failed',
			organizationId: input.organizationId,
			userId: input.userId,
			error
		});
	}
}

async function notifyAdminsOfDeclinedInvitation(
	ports: DeclineDashboardInvitationPorts,
	input: { organizationId: string; userId: string; email: string }
): Promise<void> {
	try {
		await ports.notifications.notifyAdmins(input.organizationId, input.userId, {
			type: 'member_invite_declined',
			title: 'Invitation Declined',
			message: `"${input.email}" declined their organization invitation.`,
			link: `/org/${input.organizationId}/settings`
		});
	} catch (error) {
		console.error('[dashboard-org-access]', {
			status: 'declined-notification-failed',
			organizationId: input.organizationId,
			userId: input.userId,
			error
		});
	}
}
