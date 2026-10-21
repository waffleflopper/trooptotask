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
