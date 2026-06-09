export interface PlatformOwnerMembershipRow {
	organizationId: string;
	userId: string;
	email: string | null;
}

export interface PlatformOwnerMembershipMetric {
	organizationId: string;
	ownerCount: number;
	singleOwner: PlatformOwnerMembershipRow | null;
}

export type PlatformOwnerMembershipStatus =
	| { kind: 'single'; membership: PlatformOwnerMembershipRow }
	| { kind: 'none' }
	| { kind: 'multiple'; count: number };

export interface PlatformOrganizationMetrics {
	memberCounts: Map<string, number>;
	activePersonnelCounts: Map<string, number>;
	ownerMemberships: Map<string, PlatformOwnerMembershipStatus>;
}

export interface PlatformMetricsStore {
	countMembershipsByOrganization(organizationIds: string[]): Promise<Map<string, number>>;
	countActivePersonnelByOrganization(organizationIds: string[]): Promise<Map<string, number>>;
	countActivePersonnelForOrganization(organizationId: string): Promise<number | null>;
	listOwnerMembershipMetricsByOrganization(organizationIds: string[]): Promise<PlatformOwnerMembershipMetric[]>;
}

export interface PlatformMetrics {
	countMembershipsByOrganization(organizationIds: string[]): Promise<Map<string, number>>;
	countActivePersonnelByOrganization(organizationIds: string[]): Promise<Map<string, number>>;
	countActivePersonnelForOrganization(organizationId: string): Promise<number>;
	getOwnerMembershipsByOrganization(organizationIds: string[]): Promise<Map<string, PlatformOwnerMembershipStatus>>;
	getOrganizationMetrics(organizationIds: string[]): Promise<PlatformOrganizationMetrics>;
}

export interface PlatformMetricsDependencies {
	store: PlatformMetricsStore;
}

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
				console.error('[admin] Single-owner Organization metric did not include an owner membership:', orgId);
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

async function readMetricMap(label: string, read: () => Promise<Map<string, number>>): Promise<Map<string, number>> {
	try {
		return await read();
	} catch (error) {
		console.error(`[admin] Failed to batch ${label}:`, error);
		return new Map();
	}
}

export function createPlatformMetrics(deps: PlatformMetricsDependencies): PlatformMetrics {
	const api: PlatformMetrics = {
		async countMembershipsByOrganization(organizationIds) {
			const normalizedIds = normalizeOrganizationIds(organizationIds);
			if (normalizedIds.length === 0) return new Map();
			return readMetricMap('membership counts', () => deps.store.countMembershipsByOrganization(normalizedIds));
		},

		async countActivePersonnelByOrganization(organizationIds) {
			const normalizedIds = normalizeOrganizationIds(organizationIds);
			if (normalizedIds.length === 0) return new Map();
			return readMetricMap('personnel counts', () => deps.store.countActivePersonnelByOrganization(normalizedIds));
		},

		async countActivePersonnelForOrganization(organizationId) {
			if (!organizationId) return 0;
			try {
				return (await deps.store.countActivePersonnelForOrganization(organizationId)) ?? 0;
			} catch (error) {
				console.error('[admin] Failed to read personnel count:', error);
				return 0;
			}
		},

		async getOwnerMembershipsByOrganization(organizationIds) {
			const normalizedIds = normalizeOrganizationIds(organizationIds);
			if (normalizedIds.length === 0) return new Map();

			try {
				return buildOwnerMembershipStatuses(
					normalizedIds,
					await deps.store.listOwnerMembershipMetricsByOrganization(normalizedIds)
				);
			} catch (error) {
				console.error('[admin] Failed to batch owner memberships:', error);
				return new Map();
			}
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
