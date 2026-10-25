/** Organization facts for admitted platform support operations. */
export interface OrganizationSupportOrganization {
	id: string;
	name: string;
	suspended_at: string | null;
	created_at: string;
}

export interface OrganizationSupportUserMembership {
	userId: string;
	role: string;
	organization: { id: string; name: string } | null;
}

/** Only Organization-owned facts; no caller-supplied query or table access. */
export interface OrganizationSupportReader {
	getOrganizationById(organizationId: string): Promise<OrganizationSupportOrganization | null>;
	searchOrganizationsByName(input: { query: string; maxResults: number }): Promise<Array<{ id: string; name: string }>>;
	listLatestOrganizations(input: {
		limit: number;
	}): Promise<Array<{ id: string; name: string | null; created_at: string | null }>>;
	listMembershipUserIds(userIds: string[]): Promise<string[]>;
	listMembershipsForUser(userId: string): Promise<OrganizationSupportUserMembership[]>;
}

export interface OrganizationSupportSuspensionCommands {
	suspendOrganization(input: {
		organizationId: string;
		suspendedBy: string;
		reason: string;
		suspendedAt: Date;
	}): Promise<void>;
	unsuspendOrganization(input: { organizationId: string; unsuspendedBy: string }): Promise<void>;
}
