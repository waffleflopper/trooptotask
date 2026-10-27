import type { SupabaseClient } from '@supabase/supabase-js';
import { selectAllSupabaseRows } from '$lib/server/supabasePagination.server';
import { RequestFailure } from '$lib/errors';

const EXPORT_TABLES = ['user_org_preferences'] as const;

export type IdentityExportTable = (typeof EXPORT_TABLES)[number];

export interface IdentityExportReader {
	listRows(table: IdentityExportTable): Promise<Record<string, unknown>[]>;
}

export function createSupabaseIdentityExportReader(client: SupabaseClient, orgId: string): IdentityExportReader {
	return {
		async listRows(table) {
			if (!EXPORT_TABLES.includes(table)) {
				throw new RequestFailure(400, 'Unsupported Identity export table');
			}
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
				throw new Error((result.error as { message?: string }).message ?? 'Identity export read failed');
			return result.data ?? [];
		}
	};
}
