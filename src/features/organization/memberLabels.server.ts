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

interface OrganizationMemberEmailReadStore {
	findMany<T>(
		table: string,
		orgId: string,
		filters: undefined,
		options: { select: string; inFilters: { user_id: string[] } }
	): Promise<T[]>;
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

/** Exact membership emails for a separately authorized audit read; no display-name fallback. */
export async function listOrganizationMemberEmailsByUserIds(
	store: OrganizationMemberEmailReadStore,
	orgId: string,
	userIds: string[]
): Promise<Map<string, string>> {
	if (userIds.length === 0) return new Map();
	const rows = await store.findMany<{ user_id: unknown; email: unknown }>(
		'organization_memberships',
		orgId,
		undefined,
		{ select: 'user_id, email', inFilters: { user_id: userIds } }
	);
	const emails = new Map<string, string>();
	for (const { user_id: userId, email } of rows) {
		if (typeof userId === 'string' && typeof email === 'string' && email.length > 0) emails.set(userId, email);
	}
	return emails;
}
