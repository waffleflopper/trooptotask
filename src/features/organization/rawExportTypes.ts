export const ORGANIZATION_RAW_EXPORT_TABLES = [
	'organizations',
	'organization_setup',
	'organization_memberships',
	'organization_invitations',
	'organization_invitation_email_outbox',
	'access_request_organization_invitation_links'
] as const;

export type OrganizationRawExportTable = (typeof ORGANIZATION_RAW_EXPORT_TABLES)[number];

export function isOrganizationRawExportTable(table: string): table is OrganizationRawExportTable {
	return (ORGANIZATION_RAW_EXPORT_TABLES as readonly string[]).includes(table);
}

/** Raw Organization records visible to the admitted export request's ordinary RLS client. */
export interface OrganizationRawExportReader {
	listRows(orgId: string, table: OrganizationRawExportTable): Promise<Record<string, unknown>[]>;
}
