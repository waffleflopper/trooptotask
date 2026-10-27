import type { FeatureKey } from '$lib/access/featureSwitches';

export interface OrganizationRouteIdentity {
	id: string;
	name: string | null;
	urlSlug: string | null;
	suspendedAt: string | null;
	createdAt: string | null;
	disabledFeatures: FeatureKey[];
}

export interface OrganizationMembershipSummary {
	id: string;
	name: string;
	role: string;
	urlSegment: string;
}
