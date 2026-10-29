import type { SupabaseClient } from '$lib/server/database';
import type { ScopeSet } from '$lib/access/memberAccessShape';
import type { SignInRosterPersonnelLookupPort, SignInRosterPersonnelLookupRecord } from './contracts';
import { queryScopedPersonnelRows } from './scopedRosterQuery.server';

interface SupabaseSignInRosterPersonnelRow {
	id: string;
	rank: string | null;
	last_name: string | null;
	first_name: string | null;
	group_id: string | null;
	groups?: { name?: string | null } | { name?: string | null }[] | null;
}

export function createSupabaseSignInRosterPersonnelLookupPort(
	getAdminClient: () => SupabaseClient
): SignInRosterPersonnelLookupPort {
	return {
		async findPersonnelForRosterSnapshot(
			orgId: string,
			scopeSet: ScopeSet,
			personnelIds: string[]
		): Promise<SignInRosterPersonnelLookupRecord[]> {
			const rows = await queryScopedPersonnelRows(getAdminClient, orgId, scopeSet, {
				select: 'id, rank, last_name, first_name, group_id, groups:groups!personnel_organization_group_fkey(name)',
				status: 'all',
				ids: personnelIds
			});

			return (rows as unknown as SupabaseSignInRosterPersonnelRow[]).map((row) => ({
				id: row.id,
				rank: row.rank ?? null,
				lastName: row.last_name ?? null,
				firstName: row.first_name ?? null,
				groupId: row.group_id ?? null,
				groupName: groupNameForRow(row)
			}));
		}
	};
}

function groupNameForRow(row: SupabaseSignInRosterPersonnelRow): string | null {
	if (Array.isArray(row.groups)) {
		const first = row.groups.find((group) => typeof group?.name === 'string');
		return first?.name ?? null;
	}
	return row.groups?.name ?? null;
}
