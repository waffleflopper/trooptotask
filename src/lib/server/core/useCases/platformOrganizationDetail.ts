import type { AdminRole } from '$lib/server/admin';
import type { PlatformAudit, PlatformAuditOrganizationActivity } from './platformAudit';
import type { PlatformMembershipAdministration, PlatformMembershipRole } from './platformMembershipAdministration';
import type { PlatformMetrics } from './platformMetrics';

export interface PlatformOrganizationDetailOrganizationRow {
	id: string;
	name: string;
	suspended_at: string | null;
	created_at: string;
}

export interface PlatformOrganizationDetailStore {
	getOrganizationById(orgId: string): Promise<PlatformOrganizationDetailOrganizationRow | null>;
}

export interface PlatformOrganizationDetailMember {
	userId: string;
	email: string;
	role: PlatformMembershipRole;
}

export interface PlatformOrganizationDetailOrg {
	id: string;
	name: string;
	suspendedAt: string | null;
	createdAt: string;
	isSuspended: boolean;
}

export interface PlatformOrganizationDetailLoadData {
	adminRole: AdminRole;
	org: PlatformOrganizationDetailOrg;
	members: PlatformOrganizationDetailMember[];
	personnelCount: number;
	auditEvents: PlatformAuditOrganizationActivity[];
}

export type PlatformOrganizationDetailResult =
	| { status: 'found'; detail: PlatformOrganizationDetailLoadData }
	| { status: 'not_found' }
	| { status: 'provider_error'; message: string };

export interface PlatformOrganizationDetail {
	getOrganizationDetail(orgId: string): Promise<PlatformOrganizationDetailResult>;
}

export interface PlatformOrganizationDetailDependencies {
	store: PlatformOrganizationDetailStore;
	adminRole: AdminRole;
	membershipAdministration: PlatformMembershipAdministration;
	metrics: PlatformMetrics;
	audit: PlatformAudit;
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error ?? 'Unknown provider error');
}

export function createPlatformOrganizationDetail(
	deps: PlatformOrganizationDetailDependencies
): PlatformOrganizationDetail {
	return {
		async getOrganizationDetail(orgId) {
			let org: PlatformOrganizationDetailOrganizationRow | null;
			try {
				org = await deps.store.getOrganizationById(orgId);
			} catch (error) {
				return { status: 'provider_error', message: errorMessage(error) };
			}

			if (!org) return { status: 'not_found' };

			try {
				const memberships = await deps.membershipAdministration.listMembers(orgId);
				const members = memberships.map((membership) => ({
					userId: membership.userId,
					email: membership.email ?? '(unknown)',
					role: membership.role
				}));

				const personnelCount = await deps.metrics.countActivePersonnelForOrganization(orgId);
				const auditEvents = await deps.audit.listRecentByOrganization({ orgId, limit: 10 });

				return {
					status: 'found',
					detail: {
						adminRole: deps.adminRole,
						org: {
							id: org.id,
							name: org.name,
							suspendedAt: org.suspended_at,
							createdAt: org.created_at,
							isSuspended: !!org.suspended_at
						},
						members,
						personnelCount,
						auditEvents
					}
				};
			} catch (error) {
				return { status: 'provider_error', message: errorMessage(error) };
			}
		}
	};
}
