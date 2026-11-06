import type { SupabaseClient } from '$lib/server/database';
import { selectAllSupabaseRows } from '$lib/server/supabasePagination.server';
import { assertAuditQuerySuccess } from './providerError.server';

export interface AuditExportReader {
	listRows(): Promise<Record<string, unknown>[]>;
}

/** Every column an entry saves except where it came from: the address and browser of the member are never exported. */
const EXPORT_COLUMNS =
	'id, timestamp, user_id, actor_label, org_id, action, resource_type, resource_id, record_label, subject_personnel_id, subject_label, batch_id, severity, details';

export function createSupabaseAuditExportReader(client: SupabaseClient, orgId: string): AuditExportReader {
	return {
		async listRows() {
			const result = await selectAllSupabaseRows<Record<string, unknown>>(async (from, to) => {
				const { data, error } = await client
					.from('audit_logs')
					.select(EXPORT_COLUMNS)
					.eq('org_id', orgId)
					.order('id', { ascending: true })
					.range(from, to);
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
