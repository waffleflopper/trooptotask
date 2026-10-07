import type { SupabaseClient } from '@supabase/supabase-js';
import { selectAllSupabaseRows } from '$lib/server/supabasePagination.server';
import { RequestFailure } from '$lib/errors';

const EXPORT_TABLES = ['groups', 'personnel', 'organization_rank_catalog', 'user_pinned_groups'] as const;

export type PersonnelExportTable = (typeof EXPORT_TABLES)[number];

export interface PersonnelExportReader {
	listRows(table: PersonnelExportTable): Promise<Record<string, unknown>[]>;
}

export function createSupabasePersonnelExportReader(client: SupabaseClient, orgId: string): PersonnelExportReader {
	return {
		async listRows(table) {
			if (!EXPORT_TABLES.includes(table)) {
				throw new RequestFailure(400, 'Unsupported Personnel export table');
			}
			const result = await selectAllSupabaseRows<Record<string, unknown>>(async (from, to) => {
				const { data, error } = await client.from(table).select('*').eq('organization_id', orgId).range(from, to);
				return { data, error };
			});
			if (result.error)
				throw new Error((result.error as { message?: string }).message ?? 'Personnel export read failed');
			return result.data ?? [];
		}
	};
}
