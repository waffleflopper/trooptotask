import type { SupabaseClient } from '@supabase/supabase-js';
import type { SignInRosterPersonnelLookupPort, SignInRosterPersonnelLookupRecord } from './contracts';

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
			personnelIds: string[]
		): Promise<SignInRosterPersonnelLookupRecord[]> {
			if (personnelIds.length === 0) return [];

			const { data, error } = await getAdminClient()
				.from('personnel')
				.select('id, rank, last_name, first_name, group_id, groups(name)')
				.eq('organization_id', orgId)
				.in('id', personnelIds);

			if (error) {
				throw new Error(error.message);
			}

			return ((data ?? []) as SupabaseSignInRosterPersonnelRow[]).map((row) => ({
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
