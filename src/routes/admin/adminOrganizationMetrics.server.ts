import { selectAllSupabaseRows } from '$lib/server/supabasePagination';

type AdminClient = {
	from: (table: string) => {
		select: (columns: string, options?: Record<string, unknown>) => SupabaseQuery;
	};
};

type QueryResult<T> = Promise<{ data: T[] | null; error: unknown }>;
type SupabaseQuery = {
	in: (column: string, values: string[]) => SupabaseQuery;
	is: (column: string, value: unknown) => SupabaseQuery;
	eq: (column: string, value: unknown) => SupabaseQuery;
	range: (from: number, to: number) => unknown;
};

export interface OwnerMembershipRow {
	organization_id: string;
	user_id: string;
	email: string | null;
}

function countByOrganizationId(rows: Array<{ organization_id: string }>): Map<string, number> {
	const counts = new Map<string, number>();
	for (const row of rows) {
		counts.set(row.organization_id, (counts.get(row.organization_id) ?? 0) + 1);
	}
	return counts;
}

export async function fetchPersonnelCountsByOrganization(
	adminClient: AdminClient,
	orgIds: string[]
): Promise<Map<string, number>> {
	if (orgIds.length === 0) return new Map();

	const { data, error } = await selectAllSupabaseRows<{ organization_id: string }>(
		(from, to) =>
			adminClient
				.from('personnel')
				.select('organization_id')
				.in('organization_id', orgIds)
				.is('archived_at', null)
				.range(from, to) as unknown as QueryResult<{ organization_id: string }>
	);

	if (error) {
		console.error('[admin] Failed to batch personnel counts:', error);
		return new Map();
	}

	return countByOrganizationId(data ?? []);
}

export async function fetchMembershipCountsByOrganization(
	adminClient: AdminClient,
	orgIds: string[]
): Promise<Map<string, number>> {
	if (orgIds.length === 0) return new Map();

	const { data, error } = await selectAllSupabaseRows<{ organization_id: string }>(
		(from, to) =>
			adminClient
				.from('organization_memberships')
				.select('organization_id')
				.in('organization_id', orgIds)
				.range(from, to) as unknown as QueryResult<{ organization_id: string }>
	);

	if (error) {
		console.error('[admin] Failed to batch membership counts:', error);
		return new Map();
	}

	return countByOrganizationId(data ?? []);
}

export async function fetchOwnerMembershipsByOrganization(
	adminClient: AdminClient,
	orgIds: string[]
): Promise<Map<string, OwnerMembershipRow>> {
	if (orgIds.length === 0) return new Map();

	const { data, error } = await selectAllSupabaseRows<OwnerMembershipRow>(
		(from, to) =>
			adminClient
				.from('organization_memberships')
				.select('organization_id, user_id, email')
				.in('organization_id', orgIds)
				.eq('role', 'owner')
				.range(from, to) as unknown as QueryResult<OwnerMembershipRow>
	);

	if (error) {
		console.error('[admin] Failed to batch owner memberships:', error);
		return new Map();
	}

	const ownerRowsByOrg = new Map<string, OwnerMembershipRow[]>();
	for (const membership of data ?? []) {
		const rows = ownerRowsByOrg.get(membership.organization_id) ?? [];
		rows.push(membership);
		ownerRowsByOrg.set(membership.organization_id, rows);
	}

	const ownersByOrg = new Map<string, OwnerMembershipRow>();
	for (const orgId of orgIds) {
		const rows = ownerRowsByOrg.get(orgId) ?? [];
		if (rows.length === 1) {
			ownersByOrg.set(orgId, rows[0]);
		} else {
			console.warn('[admin] Organization has unexpected owner membership count:', orgId, rows.length);
		}
	}
	return ownersByOrg;
}
