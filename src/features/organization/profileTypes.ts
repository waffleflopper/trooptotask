export interface OrganizationRouteIdentity {
	id: string;
	name: string | null;
	urlSlug: string | null;
	suspendedAt: string | null;
}

export interface OrganizationMembershipSummary {
	id: string;
	name: string;
	role: string;
	urlSegment: string;
}
