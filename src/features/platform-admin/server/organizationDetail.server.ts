import type {
	PlatformOrganizationDetailDependencies,
	PlatformOrganizationDetail,
	PlatformOrganizationDetailOrganizationRow
} from '../organizationSupportTypes';

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
				const [memberships, personnelCount, auditEvents] = await Promise.all([
					deps.membershipReader.listMembers(orgId),
					deps.personnel.countActivePersonnelForOrganization(orgId),
					deps.audit.listRecentByOrganization({ orgId, limit: 10 })
				]);
				const members = memberships.map((membership) => ({
					userId: membership.userId,
					email: membership.email ?? '(unknown)',
					role: membership.role
				}));

				return {
					status: 'found',
					detail: {
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
