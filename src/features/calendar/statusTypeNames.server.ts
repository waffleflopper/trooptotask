import type { SupabaseClient } from '$lib/server/database';
import { selectAllSupabaseRows } from '$lib/server/supabasePagination.server';

type StatusTypeNameRow = { id: string; name: string | null };

export function createSupabaseStatusTypeNamesReader(
	client: SupabaseClient,
	orgId: string
): (ids: string[]) => Promise<Map<string, string>> {
	return async (ids) => {
		if (ids.length === 0) return new Map();
		const result = await selectAllSupabaseRows<StatusTypeNameRow>(async (from, to) => {
			const { data, error } = await client
				.from('status_types')
				.select('id, name')
				.eq('organization_id', orgId)
				.in('id', ids)
				.order('id', { ascending: true })
				.range(from, to)
				.returns<StatusTypeNameRow[]>();
			return { data, error };
		});
		if (result.error)
			throw new Error((result.error as { message?: string }).message ?? 'Status type names read failed');
		return new Map((result.data ?? []).map(({ id, name }) => [id, name ?? id]));
	};
}
