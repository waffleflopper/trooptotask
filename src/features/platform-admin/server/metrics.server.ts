import type {
	PlatformOwnerMembershipStatus,
	PlatformOwnerMembershipMetric,
	PlatformMetricsDependencies,
	PlatformMetrics
} from '../organizationSupportTypes';

export function displayOwnerMembership(status: PlatformOwnerMembershipStatus | undefined): string {
	if (!status) return 'No owner';
	if (status.kind === 'single') return status.membership.email ?? '';
	if (status.kind === 'multiple') return 'Multiple owners';
	return 'No owner';
}

function normalizeOrganizationIds(organizationIds: string[]): string[] {
	return [...new Set(organizationIds.filter(Boolean))];
}

function buildOwnerMembershipStatuses(
	organizationIds: string[],
	ownerMetrics: PlatformOwnerMembershipMetric[]
): Map<string, PlatformOwnerMembershipStatus> {
	const ownerMetricsByOrg = new Map<string, PlatformOwnerMembershipMetric>();
	for (const metric of ownerMetrics) {
		ownerMetricsByOrg.set(metric.organizationId, metric);
	}

	const ownersByOrg = new Map<string, PlatformOwnerMembershipStatus>();
	for (const orgId of organizationIds) {
		const metric = ownerMetricsByOrg.get(orgId);
		const ownerCount = metric?.ownerCount ?? 0;
		if (ownerCount === 1 && metric?.singleOwner) {
			ownersByOrg.set(orgId, { kind: 'single', membership: metric.singleOwner });
		} else {
			if (ownerCount === 1) {
				throw new Error('Owner membership could not be identified');
			} else if (ownerCount !== 0) {
				console.warn('[admin] Organization has unexpected owner membership count:', orgId, ownerCount);
			}
			ownersByOrg.set(
				orgId,
				ownerCount === 0 || ownerCount === 1 ? { kind: 'none' } : { kind: 'multiple', count: ownerCount }
			);
		}
	}
	return ownersByOrg;
}

export function createPlatformMetrics(deps: PlatformMetricsDependencies): PlatformMetrics {
	const api: PlatformMetrics = {
		async countMembershipsByOrganization(organizationIds) {
			const normalizedIds = normalizeOrganizationIds(organizationIds);
			if (normalizedIds.length === 0) return new Map();
			return deps.store.countMembershipsByOrganization(normalizedIds);
		},

		async countActivePersonnelByOrganization(organizationIds) {
			const normalizedIds = normalizeOrganizationIds(organizationIds);
			if (normalizedIds.length === 0) return new Map();
			return deps.store.countActivePersonnelByOrganization(normalizedIds);
		},

		async countActivePersonnelForOrganization(organizationId) {
			if (!organizationId) return 0;
			return deps.store.countActivePersonnelForOrganization(organizationId);
		},

		async getOwnerMembershipsByOrganization(organizationIds) {
			const normalizedIds = normalizeOrganizationIds(organizationIds);
			if (normalizedIds.length === 0) return new Map();

			return buildOwnerMembershipStatuses(
				normalizedIds,
				await deps.store.listOwnerMembershipMetricsByOrganization(normalizedIds)
			);
		},

		async getOrganizationMetrics(organizationIds) {
			const normalizedIds = normalizeOrganizationIds(organizationIds);
			if (normalizedIds.length === 0) {
				return {
					memberCounts: new Map(),
					activePersonnelCounts: new Map(),
					ownerMemberships: new Map()
				};
			}

			const [memberCounts, activePersonnelCounts, ownerMemberships] = await Promise.all([
				api.countMembershipsByOrganization(normalizedIds),
				api.countActivePersonnelByOrganization(normalizedIds),
				api.getOwnerMembershipsByOrganization(normalizedIds)
			]);

			return { memberCounts, activePersonnelCounts, ownerMemberships };
		}
	};
	return api;
}
