export function stripOrganizationId(row: Record<string, unknown>): Record<string, unknown> {
	const rest = { ...row };
	delete rest.organization_id;
	return rest;
}
