import type { NotificationPort } from '$lib/server/core/ports';
import { fail } from '$lib/server/core/errors';
import {
	deriveMembershipFromInvitation,
	type OrganizationInvitationAccessShape,
	type OrganizationMembershipDraft
} from './organizationInvitationMembership';

export interface DashboardOrganizationSummary {
	id: string;
	name: string;
	role: string;
}

export interface DashboardPendingInvitationSummary {
	id: string;
	organizationId: string;
	organizationName: string;
	createdAt: string;
}

export interface DashboardInvitationRecord extends OrganizationInvitationAccessShape {
	id: string;
}

export type DashboardMembershipCreateInput = OrganizationMembershipDraft;

export interface DashboardOrgAccessPort {
	listOrganizationsForUser(userId: string): Promise<DashboardOrganizationSummary[]>;
	listPendingInvitationsForEmail(email: string): Promise<DashboardPendingInvitationSummary[]>;
	findInvitation(invitationId: string, email: string): Promise<DashboardInvitationRecord | null>;
	hasMembership(organizationId: string, userId: string): Promise<boolean>;
	createMembership(input: DashboardMembershipCreateInput): Promise<boolean>;
	deleteInvitation(invitationId: string): Promise<boolean>;
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
			redirectTo: `/org/${organizations[0].id}`
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
	const invitation = await ports.dashboard.findInvitation(input.invitationId, normalizedEmail);

	if (!invitation) {
		fail(404, 'Invitation not found');
	}

	const existingMembership = await ports.dashboard.hasMembership(invitation.organizationId, input.userId);

	if (existingMembership) {
		await cleanupInvitation(ports.dashboard, {
			invitationId: input.invitationId,
			organizationId: invitation.organizationId,
			userId: input.userId,
			reason: 'duplicate-membership-cleanup'
		});
		fail(400, 'You are already a member of this organization');
	}

	const created = await ports.dashboard.createMembership(
		deriveMembershipFromInvitation({
			invitation,
			userId: input.userId,
			email: normalizedEmail
		})
	);

	if (!created) {
		fail(500, 'Failed to accept invitation');
	}

	await cleanupInvitation(ports.dashboard, {
		invitationId: input.invitationId,
		organizationId: invitation.organizationId,
		userId: input.userId,
		reason: 'accepted-membership-cleanup'
	});

	await ports.notifications.notifyAdmins(invitation.organizationId, input.userId, {
		type: 'member_joined',
		title: 'New Member Joined',
		message: `"${input.email}" has joined the organization.`,
		link: `/org/${invitation.organizationId}/settings`
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
	return email?.toLowerCase() ?? '';
}

async function cleanupInvitation(
	port: DashboardOrgAccessPort,
	input: {
		invitationId: string;
		organizationId: string;
		userId: string;
		reason: 'accepted-membership-cleanup' | 'duplicate-membership-cleanup';
	}
): Promise<void> {
	const deleted = await port.deleteInvitation(input.invitationId);

	if (!deleted) {
		console.error('[dashboard-org-access]', {
			status: 'invitation-delete-failed',
			...input
		});
	}
}
