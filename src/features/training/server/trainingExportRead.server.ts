import type { SupabaseClient } from '@supabase/supabase-js';
import { selectAllSupabaseRows } from '$lib/server/supabasePagination.server';

const EXPORT_TABLES = ['training_types', 'personnel_trainings', 'training_views'] as const;

export type TrainingExportTable = (typeof EXPORT_TABLES)[number];

export interface TrainingExportReader {
	listRows(table: TrainingExportTable): Promise<Record<string, unknown>[]>;
}

export function createSupabaseTrainingExportReader(client: SupabaseClient, orgId: string): TrainingExportReader {
	return {
		async listRows(table) {
			if (!EXPORT_TABLES.includes(table)) {
				throw Object.assign(new Error('Unsupported Training export table'), { status: 400 });
			}
			const result = await selectAllSupabaseRows<Record<string, unknown>>(async (from, to) => {
				const { data, error } = await client.from(table).select('*').eq('organization_id', orgId).range(from, to);
				return { data, error };
			});
			if (result.error)
				throw new Error((result.error as { message?: string }).message ?? 'Training export read failed');
			return result.data ?? [];
		}
	};
}
