import type { AuditEvent, BatchAuditPort } from './contracts';
import { auditLog, auditLogMany } from './auditLog.server';

interface RequestInfo {
	userId: string | null;
	userEmail: string | null;
	ip: string;
	userAgent: string;
}

export function createSupabaseAuditAdapter(orgId: string | null, requestInfo: RequestInfo): BatchAuditPort {
	const inOrganization = (event: AuditEvent): AuditEvent => ({
		action: event.action,
		resourceType: event.resourceType,
		resourceId: event.resourceId,
		orgId: orgId ?? undefined,
		details: event.details,
		severity: event.severity,
		record: event.record,
		subject: event.subject,
		batchId: event.batchId
	});
	return {
		log: (event) => auditLog(inOrganization(event), requestInfo, { confirm: true }),
		logMany: (events) => auditLogMany(events.map(inOrganization), requestInfo)
	};
}
