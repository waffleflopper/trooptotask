import type { DataStore } from '$lib/server/core/ports';

export interface OrganizationPlanUsagePorts {
	store: DataStore;
	auth: { orgId: string };
}

export interface OrganizationPlanUsageOptions {
	now?: Date;
}

export interface UsageSourceMetadata {
	table: string;
	included: string[];
	excluded: string[];
}

export interface MonthlyExportUsageSourceMetadata extends UsageSourceMetadata {
	period: {
		start: string;
		endExclusive: string;
	};
}

export interface OrganizationPlanUsage {
	organizationId: string;
	asOf: string;
	activePersonnelCount: number;
	activeOrganizationMemberCount: number;
	pendingUnexpiredInvitationCount: number;
	monthlyExportCount: number;
	sources: {
		activePersonnel: UsageSourceMetadata;
		activeOrganizationMembers: UsageSourceMetadata;
		pendingUnexpiredInvitations: UsageSourceMetadata;
		monthlyExports: MonthlyExportUsageSourceMetadata;
	};
}

interface PersonnelUsageRow {
	id: string;
	archived_at: string | null;
}

interface OrganizationMembershipUsageRow {
	id: string;
	user_id: string;
}

interface OrganizationInvitationUsageRow {
	id: string;
	email: string | null;
	normalized_email: string | null;
	status: string | null;
	expires_at: string | null;
	created_at?: string | null;
}

interface DataExportUsageRow {
	id: string;
	created_at: string | null;
}

const CLOSED_INVITATION_STATUSES = ['expired', 'declined', 'revoked', 'blocked', 'accepted'];

function monthWindow(now: Date): { start: Date; endExclusive: Date } {
	const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
	const endExclusive = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
	return { start, endExclusive };
}

function normalizedInvitationEmail(invitation: OrganizationInvitationUsageRow): string | null {
	const value = invitation.normalized_email ?? invitation.email;
	const normalized = value?.trim().toLowerCase() ?? '';
	return normalized.length > 0 ? normalized : null;
}

function isPendingUnexpiredInvitation(invitation: OrganizationInvitationUsageRow, now: Date): boolean {
	if (invitation.status !== 'pending') return false;
	if (!invitation.expires_at) return true;
	return new Date(invitation.expires_at).getTime() > now.getTime();
}

function countUniquePendingUnexpiredInvitations(invitations: OrganizationInvitationUsageRow[], now: Date): number {
	const pendingEmails = new Set<string>();
	for (const invitation of invitations) {
		if (!isPendingUnexpiredInvitation(invitation, now)) continue;
		const email = normalizedInvitationEmail(invitation);
		if (!email) continue;
		pendingEmails.add(email);
	}
	return pendingEmails.size;
}

export async function readOrganizationPlanUsage(
	ports: OrganizationPlanUsagePorts,
	options: OrganizationPlanUsageOptions = {}
): Promise<OrganizationPlanUsage> {
	const now = options.now ?? new Date();
	const { start, endExclusive } = monthWindow(now);

	const [activePersonnelRows, memberRows, invitationRows, exportRows] = await Promise.all([
		ports.store.findMany<PersonnelUsageRow>('personnel', ports.auth.orgId, {}, { isNull: { archived_at: true } }),
		ports.store.findMany<OrganizationMembershipUsageRow>('organization_memberships', ports.auth.orgId),
		ports.store.findMany<OrganizationInvitationUsageRow>('organization_invitations', ports.auth.orgId, {
			status: 'pending'
		}),
		ports.store.findMany<DataExportUsageRow>(
			'data_exports',
			ports.auth.orgId,
			{},
			{
				rangeFilters: [
					{ column: 'created_at', op: 'gte', value: start.toISOString() },
					{ column: 'created_at', op: 'lt', value: endExclusive.toISOString() }
				]
			}
		)
	]);

	return {
		organizationId: ports.auth.orgId,
		asOf: now.toISOString(),
		activePersonnelCount: activePersonnelRows.length,
		activeOrganizationMemberCount: memberRows.length,
		pendingUnexpiredInvitationCount: countUniquePendingUnexpiredInvitations(invitationRows, now),
		monthlyExportCount: exportRows.length,
		sources: {
			activePersonnel: {
				table: 'personnel',
				included: ['organization_id = current organization', 'archived_at IS NULL'],
				excluded: ['archived_at IS NOT NULL']
			},
			activeOrganizationMembers: {
				table: 'organization_memberships',
				included: ['organization_id = current organization'],
				excluded: []
			},
			pendingUnexpiredInvitations: {
				table: 'organization_invitations',
				included: ['status = pending', `expires_at IS NULL OR expires_at > ${now.toISOString()}`],
				excluded: [...CLOSED_INVITATION_STATUSES, 'duplicate_email', 'missing_email']
			},
			monthlyExports: {
				table: 'data_exports',
				included: [
					'org_id = current organization',
					'status = any export attempt',
					`created_at >= ${start.toISOString()}`,
					`created_at < ${endExclusive.toISOString()}`
				],
				excluded: ['created_at outside current calendar month'],
				period: {
					start: start.toISOString(),
					endExclusive: endExclusive.toISOString()
				}
			}
		}
	};
}
