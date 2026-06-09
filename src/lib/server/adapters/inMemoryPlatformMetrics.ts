import type { PlatformMetricsStore, PlatformOwnerMembershipMetric } from '$lib/server/core/useCases/platformMetrics';

export interface InMemoryPlatformMetricsMembership {
	organizationId: string;
	userId: string;
	email: string | null;
	role: string;
}

export interface InMemoryPlatformMetricsPersonnel {
	organizationId: string;
	archivedAt: string | null;
}

export interface InMemoryPlatformMetricsSeed {
	memberships?: InMemoryPlatformMetricsMembership[];
	personnel?: InMemoryPlatformMetricsPersonnel[];
}

function countByOrganizationId(rows: Array<{ organizationId: string }>): Map<string, number> {
	const counts = new Map<string, number>();
	for (const row of rows) {
		counts.set(row.organizationId, (counts.get(row.organizationId) ?? 0) + 1);
	}
	return counts;
}

export function createInMemoryPlatformMetricsStore(seed: InMemoryPlatformMetricsSeed = {}): PlatformMetricsStore {
	const memberships = [...(seed.memberships ?? [])];
	const personnel = [...(seed.personnel ?? [])];

	return {
		async countMembershipsByOrganization(organizationIds) {
			const requestedIds = new Set(organizationIds);
			return countByOrganizationId(memberships.filter((row) => requestedIds.has(row.organizationId)));
		},

		async countActivePersonnelByOrganization(organizationIds) {
			const requestedIds = new Set(organizationIds);
			return countByOrganizationId(
				personnel.filter((row) => requestedIds.has(row.organizationId) && row.archivedAt == null)
			);
		},

		async countActivePersonnelForOrganization(organizationId) {
			return personnel.filter((row) => row.organizationId === organizationId && row.archivedAt == null).length;
		},

		async listOwnerMembershipMetricsByOrganization(organizationIds): Promise<PlatformOwnerMembershipMetric[]> {
			const requestedIds = new Set(organizationIds);
			return organizationIds
				.filter((organizationId) => requestedIds.has(organizationId))
				.flatMap((organizationId) => {
					const owners = memberships.filter((row) => row.organizationId === organizationId && row.role === 'owner');
					if (owners.length === 0) return [];
					return [
						{
							organizationId,
							ownerCount: owners.length,
							singleOwner:
								owners.length === 1
									? {
											organizationId,
											userId: owners[0].userId,
											email: owners[0].email
										}
									: null
						}
					];
				});
		}
	};
}
