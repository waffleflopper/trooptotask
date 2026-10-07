import type { SupabaseClient } from '@supabase/supabase-js';
import { selectAllSupabaseRows } from '$lib/server/supabasePagination.server';
import type { TrainingCatalogReadStore } from './trainingCatalogPorts.server';
import { RequestFailure } from '$lib/errors';

const EXPORT_TABLES = ['training_types', 'personnel_trainings', 'training_views'] as const;

export type TrainingExportTable = (typeof EXPORT_TABLES)[number];

export interface TrainingExportReader {
	listRows(table: TrainingExportTable): Promise<Record<string, unknown>[]>;
}

export function createSupabaseTrainingExportReader(client: SupabaseClient, orgId: string): TrainingExportReader {
	return {
		async listRows(table) {
			if (!EXPORT_TABLES.includes(table)) {
				throw new RequestFailure(400, 'Unsupported Training export table');
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

type TrainingExportReadStore = Pick<TrainingCatalogReadStore, 'findMany'>;

export function listPersonnelTrainingExportRows(
	store: TrainingExportReadStore,
	orgId: string,
	personnelId: string
): Promise<Record<string, unknown>[]> {
	return store.findMany<Record<string, unknown>>('personnel_trainings', orgId, { personnel_id: personnelId });
}
