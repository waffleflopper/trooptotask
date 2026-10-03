/** Organization facts for admitted platform support operations. */
export interface OrganizationSupportOrganization {
	id: string;
	name: string;
	suspended_at: string | null;
	created_at: string;
}

export interface OrganizationSupportPageQuery {
	q: string;
	status: string;
	from: number;
	to: number;
}

export interface OrganizationSupportPage {
	organizations: OrganizationSupportOrganization[];
	totalCount: number;
}

export interface OrganizationSupportUserMembership {
	userId: string;
	role: string;
	organization: { id: string; name: string } | null;
}

export interface OrganizationSupportOwnerMembership {
	organizationId: string;
	userId: string;
	email: string | null;
}

export interface OrganizationSupportOwnerMembershipMetric {
	organizationId: string;
	ownerCount: number;
	singleOwner: OrganizationSupportOwnerMembership | null;
}

/** Only Organization-owned facts; no caller-supplied query or table access. */
export interface OrganizationSupportReader {
	listOrganizationsPage(query: OrganizationSupportPageQuery): Promise<OrganizationSupportPage>;
	getOrganizationById(organizationId: string): Promise<OrganizationSupportOrganization | null>;
	searchOrganizationsByName(input: { query: string; maxResults: number }): Promise<Array<{ id: string; name: string }>>;
	listLatestOrganizations(input: {
		limit: number;
	}): Promise<Array<{ id: string; name: string | null; created_at: string | null }>>;
	listMembershipUserIds(userIds: string[]): Promise<string[]>;
	listMembershipsForUser(userId: string): Promise<OrganizationSupportUserMembership[]>;
	countMembershipsByOrganization(organizationIds: string[]): Promise<Map<string, number>>;
	countLeaderMembershipsByOrganization(organizationIds: string[]): Promise<Map<string, number>>;
	listOwnerMembershipMetricsByOrganization(
		organizationIds: string[]
	): Promise<OrganizationSupportOwnerMembershipMetric[]>;
	countOrganizations(): Promise<number>;
}

export interface OrganizationSupportSuspensionCommands {
	suspendOrganization(input: { organizationId: string; suspendedAt: Date }): Promise<void>;
	unsuspendOrganization(organizationId: string): Promise<void>;
}
