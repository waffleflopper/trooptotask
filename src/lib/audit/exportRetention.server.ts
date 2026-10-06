import type { SupabaseClient } from '@supabase/supabase-js';
import { selectAllSupabaseRows } from '$lib/server/supabasePagination.server';
import { assertAuditQuerySuccess } from './providerError.server';

export interface AuditExportReader {
	listRows(): Promise<Record<string, unknown>[]>;
}

export function createSupabaseAuditExportReader(client: SupabaseClient, orgId: string): AuditExportReader {
	return {
		async listRows() {
			const result = await selectAllSupabaseRows<Record<string, unknown>>(async (from, to) => {
				const { data, error } = await client.from('audit_logs').select('*').eq('org_id', orgId).range(from, to);
				return { data, error };
			});
			if (result.error) throw new Error((result.error as { message?: string }).message ?? 'Audit export read failed');
			return result.data ?? [];
		}
	};
}

/** Scheduled delivery admits the configured credential before this owned operation. */
export async function cleanupAuditLogs(client: SupabaseClient): Promise<number> {
	const response = await client.rpc('cleanup_old_audit_logs');
	assertAuditQuerySuccess('Audit retention', response);
	return (response.data as number | null) ?? 0;
}
