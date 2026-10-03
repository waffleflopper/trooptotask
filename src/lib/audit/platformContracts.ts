export type PlatformAuditSeverity = 'info' | 'warning' | 'critical' | string;

export interface PlatformAuditLogEntry {
	id: string;
	userId: string | null;
	orgId: string | null;
	action: string;
	resourceType: string | null;
	resourceId: string | null;
	ipAddress: string | null;
	details: Record<string, unknown> | null;
	severity: PlatformAuditSeverity;
	createdAt: string;
}

export interface PlatformAuditOrganizationActivity {
	id: string;
	action: string;
	userId: string | null;
	timestamp: string;
	severity: PlatformAuditSeverity;
	resourceType: string | null;
	resourceId: string | null;
}

export interface PlatformAuditUserActivity {
	id: string;
	action: string;
	resourceType: string | null;
	resourceId: string | null;
	orgId: string | null;
	timestamp: string;
	severity: PlatformAuditSeverity;
}

export interface PlatformAuditListInput {
	page: number;
	limit?: number;
	action?: string;
	severity?: string;
	orgId?: string;
}

export interface PlatformAuditListResult {
	logs: PlatformAuditLogEntry[];
	totalCount: number;
	page: number;
	limit: number;
	actionFilter: string;
	severityFilter: string;
	orgFilter: string;
	availableActions: string[];
}

export interface PlatformAuditDashboardActivity {
	id: string;
	action: string;
	user_id: string | null;
	timestamp: string;
}

export interface PlatformAudit {
	listRecentActivity(input: { limit?: number }): Promise<PlatformAuditDashboardActivity[]>;
	listLogs(input: PlatformAuditListInput): Promise<PlatformAuditListResult>;
	listRecentByOrganization(input: { orgId: string; limit?: number }): Promise<PlatformAuditOrganizationActivity[]>;
	listRecentByUser(input: { userId: string; limit?: number }): Promise<PlatformAuditUserActivity[]>;
}
