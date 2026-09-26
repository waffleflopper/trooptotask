import type { SupabaseClient } from '@supabase/supabase-js';
import type { SignInRosterPersonnelLookupPort, SignInRosterPersonnelLookupRecord } from './contracts';

type SupabaseSignInRosterPersonnelRow = SignInRosterPersonnelLookupRecord & {
	groups?: { name?: string | null } | { name?: string | null }[] | null;
};

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
				last_name: row.last_name ?? null,
				first_name: row.first_name ?? null,
				group_id: row.group_id ?? null,
				group_name: groupNameForRow(row)
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
