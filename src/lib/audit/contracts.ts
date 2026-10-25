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

/** A supplied best-effort sink. A failed write never rejects, so a caller that needs the write settled can await it. */
export interface AuditPort {
	log(event: AuditEvent): void | Promise<void>;
}

export interface AuditLogEntry {
	id: string;
	userId: string | null;
	actor: string | null;
	action: string;
	resourceType: string | null;
	resourceId: string | null;
	details: Record<string, unknown> | null;
	createdAt: string;
}

export interface AuditLogQueryInput {
	page: number;
	action?: string;
	limit?: number;
	/** ISO instant from which `recentCount` counts entries. */
	recentSince: string;
}

export interface AuditLogQueryResult {
	logs: AuditLogEntry[];
	totalCount: number;
	recentCount: number;
	page: number;
	limit: number;
	actionFilter: string;
	availableActions: string[];
}
