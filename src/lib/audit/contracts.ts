import type { AuditLogFilters } from './auditLogFilters';

export type AuditSeverity = 'info' | 'warning' | 'critical';
export type {
	PlatformAudit,
	PlatformAuditSeverity,
	PlatformActivityEvent,
	PlatformAuditOrganizationActivity,
	PlatformAuditUserActivity,
	PlatformActivityInput,
	PlatformActivityResult,
	PlatformAuditDashboardActivity
} from './platformContracts';

export interface AuditEvent {
	action: string;
	resourceType: string;
	resourceId?: string;
	orgId?: string;
	details?: Record<string, unknown>;
	severity?: AuditSeverity;
}

/** A supplied best-effort sink. A failed write never rejects, and every caller awaits it so the write finishes before the response. */
export interface AuditPort {
	log(event: AuditEvent): Promise<void>;
}

export interface AuditLogEntry {
	id: string;
	userId: string | null;
	actor: string | null;
	action: string;
	resourceType: string | null;
	resourceId: string | null;
	details: Record<string, unknown> | null;
	/** Labels saved when the entry was written; null on entries written before saved labels. */
	recordLabel: string | null;
	subject: { personnelId: string | null; label: string } | null;
	/** Shared by every entry one action wrote. */
	batchId: string | null;
	createdAt: string;
}

export interface AuditLogQueryInput {
	filters: AuditLogFilters;
	timeZone: string;
	after?: string;
	limit?: number;
}

export interface AuditLogQueryResult {
	logs: AuditLogEntry[];
	/** Passed as `after` to read the entries older than this page; null when this page reached the oldest match. */
	nextCursor: string | null;
}
