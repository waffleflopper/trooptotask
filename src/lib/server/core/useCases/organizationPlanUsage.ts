import type { DataStore, FindOptions } from '$lib/server/core/ports';

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

interface OrganizationInvitationUsageRow {
	email: string | null;
	normalized_email: string | null;
	expires_at: string | null;
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

// Invitation queries already filter to pending, unexpired rows; this only handles email fallback and dedupe.
function countUniquePendingUnexpiredInvitations(invitations: OrganizationInvitationUsageRow[]): number {
	const pendingEmails = new Set<string>();
	for (const invitation of invitations) {
		const email = normalizedInvitationEmail(invitation);
		if (!email) continue;
		pendingEmails.add(email);
	}
	return pendingEmails.size;
}

async function countRows(
	store: DataStore,
	table: string,
	orgId: string,
	filters?: Record<string, unknown>,
	options: FindOptions = {}
): Promise<number> {
	const result = await store.findManyWithCount<{ id: string }>(table, orgId, filters, {
		...options,
		select: options.select ?? 'id',
		range: { from: 0, to: 0 },
		count: options.count ?? 'exact'
	});
	return result.count ?? result.data.length;
}

export async function readOrganizationPlanUsage(
	ports: OrganizationPlanUsagePorts,
	options: OrganizationPlanUsageOptions = {}
): Promise<OrganizationPlanUsage> {
	const now = options.now ?? new Date();
	const { start, endExclusive } = monthWindow(now);

	const [
		activePersonnelCount,
		activeOrganizationMemberCount,
		pendingInvitationsWithoutExpiry,
		pendingInvitationsWithFutureExpiry,
		monthlyExportCount
	] = await Promise.all([
		countRows(ports.store, 'personnel', ports.auth.orgId, {}, { isNull: { archived_at: true } }),
		countRows(ports.store, 'organization_memberships', ports.auth.orgId),
		ports.store.findMany<OrganizationInvitationUsageRow>(
			'organization_invitations',
			ports.auth.orgId,
			{
				status: 'pending'
			},
			{
				select: 'email, normalized_email, expires_at',
				isNull: { expires_at: true }
			}
		),
		ports.store.findMany<OrganizationInvitationUsageRow>(
			'organization_invitations',
			ports.auth.orgId,
			{
				status: 'pending'
			},
			{
				select: 'email, normalized_email, expires_at',
				rangeFilters: [{ column: 'expires_at', op: 'gt', value: now.toISOString() }]
			}
		),
		countRows(
			ports.store,
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
	const invitationRows = [...pendingInvitationsWithoutExpiry, ...pendingInvitationsWithFutureExpiry];

	return {
		organizationId: ports.auth.orgId,
		asOf: now.toISOString(),
		activePersonnelCount,
		activeOrganizationMemberCount,
		pendingUnexpiredInvitationCount: countUniquePendingUnexpiredInvitations(invitationRows),
		monthlyExportCount,
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
