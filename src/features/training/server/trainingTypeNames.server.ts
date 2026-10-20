import type { SupabaseClient } from '@supabase/supabase-js';
import { selectAllSupabaseRows } from '$lib/server/supabasePagination.server';

type TrainingTypeNameRow = { id: string; name: string | null };

export function createSupabaseTrainingTypeNamesReader(
	client: SupabaseClient,
	orgId: string
): (ids: string[]) => Promise<Map<string, string>> {
	return async (ids) => {
		if (ids.length === 0) return new Map();
		const result = await selectAllSupabaseRows<TrainingTypeNameRow>(async (from, to) => {
			const { data, error } = await client
				.from('training_types')
				.select('id, name')
				.eq('organization_id', orgId)
				.in('id', ids)
				.order('id', { ascending: true })
				.range(from, to)
				.returns<TrainingTypeNameRow[]>();
			return { data, error };
		});
		if (result.error)
			throw new Error((result.error as { message?: string }).message ?? 'Training type names read failed');
		return new Map((result.data ?? []).map(({ id, name }) => [id, name ?? id]));
	};
}
