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

export interface DashboardInvitationAcceptInput {
	invitationId: string;
	userId: string;
	email: string;
}

export interface DashboardInvitationAcceptResult {
	status: DashboardInvitationAcceptStatus;
	organizationId: string | null;
}

export interface DashboardOrgAccessPort {
	listOrganizationsForUser(userId: string): Promise<DashboardOrganizationSummary[]>;
	listPendingInvitationsForEmail(email: string): Promise<DashboardPendingInvitationSummary[]>;
	acceptInvitation(input: DashboardInvitationAcceptInput): Promise<DashboardInvitationAcceptResult>;
	deleteInvitationForEmail(invitationId: string, email: string): Promise<boolean>;
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

interface DeclineDashboardInvitationInput {
	invitationId: string;
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
	port: DashboardOrgAccessPort,
	input: DeclineDashboardInvitationInput
): Promise<{ success: true; declined: true }> {
	const declined = await port.deleteInvitationForEmail(input.invitationId, normalizeEmail(input.email));

	if (!declined) {
		fail(500, 'Failed to decline invitation');
	}

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
