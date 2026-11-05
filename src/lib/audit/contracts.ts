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

export interface AuditSubject {
	personnelId: string | null;
	/** The roster form, `<rank> <last>, <first>`. Left out, the database reads it from the person's row. */
	label?: string;
}

export interface AuditEvent {
	action: string;
	resourceType: string;
	resourceId?: string;
	orgId?: string;
	details?: Record<string, unknown>;
	severity?: AuditSeverity;
	/** The record's label at the time of the action. A cataloged kind requires it. */
	record?: string;
	/** Whose record it was. A cataloged kind about a person requires it. */
	subject?: AuditSubject;
	batchId?: string;
}

/** Every caller awaits the write, and a write that fails rejects so the request reports the error. */
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
