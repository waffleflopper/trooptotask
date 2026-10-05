const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface OrganizationMemberLabelRow {
	user_id: string;
	email?: string | null;
	name?: string | null;
	display_name?: string | null;
	full_name?: string | null;
	first_name?: string | null;
	last_name?: string | null;
	username?: string | null;
}

export interface OrganizationMemberLabelReader {
	findMembers(orgId: string, userIds: string[]): Promise<OrganizationMemberLabelRow[]>;
}

function compact(value: unknown): string {
	return typeof value === 'string' ? value.trim() : '';
}

function labelForRow(row: OrganizationMemberLabelRow): string {
	const fullName =
		compact(row.display_name) ||
		compact(row.full_name) ||
		compact(row.name) ||
		[compact(row.first_name), compact(row.last_name)].filter(Boolean).join(' ');
	return fullName || compact(row.username) || compact(row.email) || row.user_id;
}

export async function loadOrganizationMemberLabels(
	reader: OrganizationMemberLabelReader,
	orgId: string,
	contributorIds: string[]
): Promise<Map<string, string>> {
	const userIds = [...new Set(contributorIds.filter((id) => UUID_PATTERN.test(id)))];
	if (userIds.length === 0) return new Map();
	const rows = await reader.findMembers(orgId, userIds);
	return new Map(rows.map((row) => [row.user_id, labelForRow(row)]));
}
