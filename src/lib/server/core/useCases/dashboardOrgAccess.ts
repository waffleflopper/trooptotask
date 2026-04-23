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
	findPendingInvitation(invitationId: string, email: string): Promise<DashboardInvitationRecord | null>;
	hasMembership(organizationId: string, userId: string): Promise<boolean>;
	createMembership(input: DashboardMembershipCreateInput): Promise<boolean>;
	deleteInvitation(invitationId: string): Promise<void>;
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
	const invitation = await ports.dashboard.findPendingInvitation(input.invitationId, normalizedEmail);

	if (!invitation) {
		fail(404, 'Invitation not found');
	}

	const existingMembership = await ports.dashboard.hasMembership(invitation.organizationId, input.userId);

	if (existingMembership) {
		await ports.dashboard.deleteInvitation(input.invitationId);
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

	await ports.dashboard.deleteInvitation(input.invitationId);

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
