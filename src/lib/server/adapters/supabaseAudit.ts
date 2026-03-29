/**
 * AuditPort implementation backed by Supabase.
 * Fires-and-forgets audit events — failures are silently swallowed so they never
 * block the main request. Audit logs are written to the `audit_logs` table.
 */
import type { AuditPort } from '../core/ports';
import { auditLog } from '$lib/server/auditLog';

interface RequestInfo {
	userId: string | null;
	userEmail: string | null;
	ip: string;
	userAgent: string;
}

export function createSupabaseAuditAdapter(orgId: string, requestInfo: RequestInfo): AuditPort {
	return {
		log(event): void {
			auditLog(
				{
					action: event.action,
					resourceType: event.resourceType,
					resourceId: event.resourceId,
					orgId,
					details: event.details
				},
				requestInfo
			).catch(() => {});
		}
	};
}
