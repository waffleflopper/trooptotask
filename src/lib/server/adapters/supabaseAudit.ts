import type { AuditPort } from '../core/ports';
import { auditLog } from '$lib/server/auditLog';

interface RequestInfo {
	userId: string | null;
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
