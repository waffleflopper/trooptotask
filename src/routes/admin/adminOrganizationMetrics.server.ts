import { selectAllSupabaseRows } from '$lib/server/supabasePagination';

export type AdminMetricsClient = {
	from: (table: string) => {
		select: (columns: string, options?: Record<string, unknown>) => SupabaseQuery;
	};
	rpc: (fn: 'count_personnel_by_organization', params: { p_org_ids: string[] }) => unknown;
};

type QueryResult<T> = Promise<{ data: T[] | null; error: unknown }>;
type SupabaseQuery = {
	in: (column: string, values: string[]) => SupabaseQuery;
	is: (column: string, value: unknown) => SupabaseQuery;
	eq: (column: string, value: unknown) => SupabaseQuery;
	range: (from: number, to: number) => unknown;
};
type PersonnelCountRow = { organization_id: string; personnel_count: number | string | null };

export interface OwnerMembershipRow {
	organization_id: string;
	user_id: string;
	email: string | null;
}

export type OwnerMembershipStatus =
	| { kind: 'single'; membership: OwnerMembershipRow }
	| { kind: 'none' }
	| { kind: 'multiple'; count: number };

export function displayOwnerMembership(status: OwnerMembershipStatus | undefined): string {
	if (!status) return 'No owner';
	if (status.kind === 'single') return status.membership.email ?? '';
	if (status.kind === 'multiple') return 'Multiple owners';
	return 'No owner';
}

function countByOrganizationId(rows: Array<{ organization_id: string }>): Map<string, number> {
	const counts = new Map<string, number>();
	for (const row of rows) {
		counts.set(row.organization_id, (counts.get(row.organization_id) ?? 0) + 1);
	}
	return counts;
}

function countRowsByOrganizationId(rows: PersonnelCountRow[]): Map<string, number> {
	const counts = new Map<string, number>();
	for (const row of rows) {
		const count = typeof row.personnel_count === 'number' ? row.personnel_count : Number(row.personnel_count ?? 0);
		counts.set(row.organization_id, Number.isFinite(count) ? count : 0);
	}
	return counts;
}

export async function fetchPersonnelCountsByOrganization(
	adminClient: AdminMetricsClient,
	orgIds: string[]
): Promise<Map<string, number>> {
	if (orgIds.length === 0) return new Map();

	const { data, error } = (await adminClient.rpc('count_personnel_by_organization', {
		p_org_ids: orgIds
	})) as { data: PersonnelCountRow[] | null; error: unknown };

	if (error) {
		console.error('[admin] Failed to batch personnel counts:', error);
		return new Map();
	}

	return countRowsByOrganizationId(data ?? []);
}

export async function fetchMembershipCountsByOrganization(
	adminClient: AdminMetricsClient,
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
	adminClient: AdminMetricsClient,
	orgIds: string[]
): Promise<Map<string, OwnerMembershipStatus>> {
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

	const ownersByOrg = new Map<string, OwnerMembershipStatus>();
	for (const orgId of orgIds) {
		const rows = ownerRowsByOrg.get(orgId) ?? [];
		if (rows.length === 1) {
			ownersByOrg.set(orgId, { kind: 'single', membership: rows[0] });
		} else {
			console.warn('[admin] Organization has unexpected owner membership count:', orgId, rows.length);
			ownersByOrg.set(orgId, rows.length === 0 ? { kind: 'none' } : { kind: 'multiple', count: rows.length });
		}
	}
	return ownersByOrg;
}
