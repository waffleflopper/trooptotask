import type { SupabaseClient } from '@supabase/supabase-js';
import { selectAllSupabaseRows } from '$lib/server/supabasePagination.server';

export interface DashboardExportReader {
	listRows(): Promise<Record<string, unknown>[]>;
}

export function createSupabaseDashboardExportReader(client: SupabaseClient, orgId: string): DashboardExportReader {
	return {
		async listRows() {
			const result = await selectAllSupabaseRows<Record<string, unknown>>(async (from, to) => {
				const { data, error } = await client.from('dashboard_configs').select('*').eq('org_id', orgId).range(from, to);
				return { data, error };
			});
			if (result.error)
				throw new Error((result.error as { message?: string }).message ?? 'Dashboard export read failed');
			return result.data ?? [];
		}
	};
}
