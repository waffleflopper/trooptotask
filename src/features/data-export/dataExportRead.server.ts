import type { SupabaseClient } from '@supabase/supabase-js';
import { selectAllSupabaseRows } from '$lib/server/supabasePagination.server';

export interface DataExportReader {
	listRows(): Promise<Record<string, unknown>[]>;
}

export function createSupabaseDataExportReader(client: SupabaseClient, orgId: string): DataExportReader {
	return {
		async listRows() {
			const result = await selectAllSupabaseRows<Record<string, unknown>>(async (from, to) => {
				const { data, error } = await client
					.from('data_exports')
					.select('*')
					.eq('org_id', orgId)
					.order('id', { ascending: true })
					.range(from, to);
				return { data, error };
			});
			if (result.error) throw new Error((result.error as { message?: string }).message ?? 'Data export read failed');
			return result.data ?? [];
		}
	};
}
