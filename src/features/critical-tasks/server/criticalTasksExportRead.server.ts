import type { SupabaseClient } from '@supabase/supabase-js';
import { selectAllSupabaseRows } from '$lib/server/supabasePagination.server';

const EXPORT_TABLES = ['ict_tasks', 'personnel_ict_completions'] as const;

export type CriticalTasksExportTable = (typeof EXPORT_TABLES)[number];

export interface CriticalTasksExportReader {
	listRows(table: CriticalTasksExportTable): Promise<Record<string, unknown>[]>;
}

export function createSupabaseCriticalTasksExportReader(
	client: SupabaseClient,
	orgId: string
): CriticalTasksExportReader {
	return {
		async listRows(table) {
			if (!EXPORT_TABLES.includes(table)) {
				throw Object.assign(new Error('Unsupported Critical Tasks export table'), { status: 400 });
			}
			const result = await selectAllSupabaseRows<Record<string, unknown>>(async (from, to) => {
				const { data, error } = await client.from(table).select('*').eq('organization_id', orgId).range(from, to);
				return { data, error };
			});
			if (result.error)
				throw new Error((result.error as { message?: string }).message ?? 'Critical Tasks export read failed');
			return result.data ?? [];
		}
	};
}
