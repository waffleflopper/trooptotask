import type { SupabaseClient } from '$lib/server/database';
import { selectAllSupabaseRows } from '$lib/server/supabasePagination.server';

type PersonnelNameRow = { id: string; rank: string | null; last_name: string | null; first_name: string | null };

export function createSupabasePersonnelNamesReader(
	client: SupabaseClient,
	orgId: string
): (ids: string[]) => Promise<Map<string, string>> {
	return async (ids) => {
		if (ids.length === 0) return new Map();
		const result = await selectAllSupabaseRows<PersonnelNameRow>(async (from, to) => {
			const { data, error } = await client
				.from('personnel')
				.select('id, rank, last_name, first_name')
				.eq('organization_id', orgId)
				.in('id', ids)
				.order('id', { ascending: true })
				.range(from, to)
				.returns<PersonnelNameRow[]>();
			return { data, error };
		});
		if (result.error) throw new Error((result.error as { message?: string }).message ?? 'Personnel names read failed');
		return new Map(
			(result.data ?? []).map((row) => [row.id, [row.rank, row.last_name, row.first_name].filter(Boolean).join(' ')])
		);
	};
}
