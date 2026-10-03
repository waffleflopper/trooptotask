import type { SupabaseClient } from '@supabase/supabase-js';
import { selectAllSupabaseRows } from '$lib/server/supabasePagination.server';
import type { TrainingSupportReader } from '../supportReadTypes';

/** Training selects and maps its own saved configuration, after delivery admission. */
export function createTrainingSupportReader(client: SupabaseClient): TrainingSupportReader {
	return {
		async countTrainingTypesByOrganization(organizationIds) {
			const ids = [...new Set(organizationIds.filter(Boolean))];
			if (ids.length === 0) return new Map();
			type Row = { id: string; organization_id: string };
			const { data, error } = await selectAllSupabaseRows<Row>(
				(from, to) =>
					client
						.from('training_types')
						.select('id, organization_id')
						.in('organization_id', ids)
						.order('organization_id', { ascending: true })
						.order('id', { ascending: true })
						.range(from, to) as unknown as Promise<{ data: Row[] | null; error: unknown }>
			);
			if (error) throw error;
			const counts = new Map<string, number>();
			for (const row of data ?? []) counts.set(row.organization_id, (counts.get(row.organization_id) ?? 0) + 1);
			return counts;
		}
	};
}
