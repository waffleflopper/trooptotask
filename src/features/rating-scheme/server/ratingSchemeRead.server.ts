import type { SupabaseClient } from '$lib/server/database';
import { selectAllSupabaseRows } from '$lib/server/supabasePagination.server';

export interface RatingSchemeExportReader {
	listRatingSchemeRows(): Promise<Record<string, unknown>[]>;
	listEvaluationRows(): Promise<Record<string, unknown>[]>;
}

export function createSupabaseRatingSchemeExportReader(
	client: SupabaseClient,
	orgId: string
): RatingSchemeExportReader {
	async function listRows(table: 'rating_schemes' | 'evaluations') {
		const result = await selectAllSupabaseRows<Record<string, unknown>>(async (from, to) => {
			const { data, error } = await client
				.from(table)
				.select('*')
				.eq('organization_id', orgId)
				.order('id', { ascending: true })
				.range(from, to);
			return { data, error };
		});
		if (result.error)
			throw new Error((result.error as { message?: string }).message ?? 'Rating Scheme export read failed');
		return result.data ?? [];
	}
	return {
		listRatingSchemeRows: () => listRows('rating_schemes'),
		listEvaluationRows: () => listRows('evaluations')
	};
}
