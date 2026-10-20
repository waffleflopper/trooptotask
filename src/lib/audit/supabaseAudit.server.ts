/**
 * AuditPort implementation backed by Supabase.
 * Failures are swallowed so they never block the main request. Callers may ignore the
 * returned promise or await it to know the write has settled. Audit logs are written to
 * the `audit_logs` table.
 */
import type { AuditPort } from './contracts';
import { auditLog } from './auditLog.server';

interface RequestInfo {
	userId: string | null;
	userEmail: string | null;
	ip: string;
	userAgent: string;
}

export function createSupabaseAuditAdapter(orgId: string | null, requestInfo: RequestInfo): AuditPort {
	return {
		log(event) {
			return auditLog(
				{
					action: event.action,
					resourceType: event.resourceType,
					resourceId: event.resourceId,
					orgId: orgId ?? undefined,
					details: event.details,
					severity: event.severity
				},
				requestInfo
			).catch(() => {});
		}
	};
}
