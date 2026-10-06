import type { SupabaseClient } from '@supabase/supabase-js';
import { selectAllSupabaseRows } from '$lib/server/supabasePagination.server';

const EXPORT_TABLES = ['getting_started_progress', 'user_org_preferences'] as const;

export type IdentityExportTable = (typeof EXPORT_TABLES)[number];

export interface IdentityExportReader {
	listRows(table: IdentityExportTable): Promise<Record<string, unknown>[]>;
}

export function createSupabaseIdentityExportReader(client: SupabaseClient, orgId: string): IdentityExportReader {
	return {
		async listRows(table) {
			if (!EXPORT_TABLES.includes(table)) {
				throw Object.assign(new Error('Unsupported Identity export table'), { status: 400 });
			}
			const result = await selectAllSupabaseRows<Record<string, unknown>>(async (from, to) => {
				const { data, error } = await client.from(table).select('*').eq('organization_id', orgId).range(from, to);
				return { data, error };
			});
			if (result.error)
				throw new Error((result.error as { message?: string }).message ?? 'Identity export read failed');
			return result.data ?? [];
		}
	};
}
