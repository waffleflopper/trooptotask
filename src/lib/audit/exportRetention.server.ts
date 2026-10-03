import type { SupabaseClient } from '@supabase/supabase-js';
import { assertAuditQuerySuccess } from './providerError.server';

interface AuditExportStore {
	findMany<T>(table: 'audit_logs', orgId: string): Promise<T[]>;
}

/** The admitted Organization export retains saved raw Audit fields. */
export function listAuditExportRows(store: AuditExportStore, orgId: string): Promise<Record<string, unknown>[]> {
	return store.findMany<Record<string, unknown>>('audit_logs', orgId);
}

/** Scheduled delivery admits the configured credential before this owned operation. */
export async function cleanupAuditLogs(client: SupabaseClient): Promise<number> {
	const response = await client.rpc('cleanup_old_audit_logs');
	assertAuditQuerySuccess('Audit retention', response);
	return (response.data as number | null) ?? 0;
}
