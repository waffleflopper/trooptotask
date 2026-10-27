import { fail } from '$lib/errors';
import type { NotificationDeliveryPort } from '$features/notifications/contracts';
export interface DashboardInvitationAuditPort {
	log(event: { action: string; resourceType: string; resourceId?: string; details?: Record<string, unknown> }): void;
}

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
	| 'setup_required'
	| 'expired'
	| 'blocked'
	| 'unavailable'
	| 'already_member'
	| 'already_accepted'
	| 'failed';

export type DashboardInvitationDeclineStatus =
	| 'declined'
	| 'not_found'
	| 'expired'
	| 'blocked'
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
	notifications: Pick<NotificationDeliveryPort, 'notifyAdmins'>;
	audit?: DashboardInvitationAuditFactory;
}

interface AcceptDashboardInvitationInput {
	invitationId: string;
	userId: string;
	email?: string | null;
}

interface DeclineDashboardInvitationPorts {
	dashboard: DashboardOrgAccessPort;
	notifications: Pick<NotificationDeliveryPort, 'notifyAdmins'>;
	audit?: DashboardInvitationAuditFactory;
}

interface DeclineDashboardInvitationInput {
	invitationId: string;
	userId: string;
	email?: string | null;
}

type DashboardInvitationAuditFactory = (organizationId: string) => DashboardInvitationAuditPort;

export async function loadDashboardOrgAccess(
	port: DashboardOrgAccessPort,
	input: DashboardOrgAccessInput
): Promise<DashboardOrgAccessResult> {
	const normalizedEmail = normalizeEmail(input.email);
	const [organizations, pendingInvitations] = await Promise.all([
		port.listOrganizationsForUser(input.userId),
		port.listPendingInvitationsForEmail(normalizedEmail)
	]);

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
		fail(404, 'This invitation is no longer available. Ask the unit to send a new one.');
	}
	if (accepted.status === 'setup_required') {
		fail(403, 'Complete account setup before accepting this organization invitation');
	}
	if (accepted.status === 'expired') {
		if (accepted.organizationId) {
			await notifyAdminsOfExpiredInvitation(ports, {
				organizationId: accepted.organizationId,
				userId: input.userId,
				email: normalizedEmail
			});
		}
		fail(400, 'This invitation has expired. Ask the unit to send a new one.');
	}
	if (accepted.status === 'blocked') {
		fail(400, 'This organization invitation is no longer available because platform access was rejected');
	}
	if (accepted.status === 'unavailable') {
		fail(409, 'This Organization invitation is unavailable. Ask the inviting Organization for help.');
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
	ports.audit?.(accepted.organizationId).log({
		action: 'organization_invitation.accepted',
		resourceType: 'organization_invitation',
		resourceId: input.invitationId,
		details: {
			organizationId: accepted.organizationId,
			userId: input.userId,
			stateTransition: 'pending.accepted'
		}
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
		fail(404, 'This invitation is no longer available. Ask the unit to send a new one.');
	}
	if (declined.status === 'expired') {
		if (declined.organizationId) {
			await notifyAdminsOfExpiredInvitation(ports, {
				organizationId: declined.organizationId,
				userId: input.userId,
				email: normalizedEmail
			});
		}
		fail(400, 'This invitation has expired. Ask the unit to send a new one.');
	}
	if (declined.status === 'blocked') {
		fail(400, 'This organization invitation is no longer available because platform access was rejected');
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
	ports.audit?.(declined.organizationId).log({
		action: 'organization_invitation.declined',
		resourceType: 'organization_invitation',
		resourceId: input.invitationId,
		details: {
			organizationId: declined.organizationId,
			userId: input.userId,
			stateTransition: 'pending.declined'
		}
	});

	return { success: true, declined: true };
}

function normalizeEmail(email?: string | null): string {
	return email?.trim().toLowerCase() ?? '';
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
			link: `/org/${input.organizationId}/settings/general`
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
			link: `/org/${input.organizationId}/settings/general`
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

async function notifyAdminsOfExpiredInvitation(
	ports: AcceptDashboardInvitationPorts | DeclineDashboardInvitationPorts,
	input: { organizationId: string; userId: string; email: string }
): Promise<void> {
	try {
		await ports.notifications.notifyAdmins(input.organizationId, input.userId, {
			type: 'member_invite_expired',
			title: 'Invitation Expired',
			message: `"${input.email}" tried to use an expired organization invitation.`,
			link: `/org/${input.organizationId}/settings/general`
		});
	} catch (error) {
		console.error('[dashboard-org-access]', {
			status: 'expired-notification-failed',
			organizationId: input.organizationId,
			userId: input.userId,
			error
		});
	}
}
