export type PlatformAuditSeverity = 'info' | 'warning' | 'critical' | string;

/** A platform audit row as Activity reads it, with the Organization name joined in the same query. */
export interface PlatformActivityEvent {
	id: string;
	timestamp: string;
	action: string;
	severity: PlatformAuditSeverity;
	userId: string | null;
	orgId: string | null;
	orgName: string | null;
	resourceType: string | null;
	resourceId: string | null;
	ipAddress: string | null;
	details: Record<string, unknown> | null;
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

export interface PlatformActivityInput {
	/** An event matches when its action is listed here or starts with one of the prefixes. */
	actions: string[];
	prefixes: string[];
	/** Case-insensitive text found in the action, actor email, target name, resource ID or Organization name. */
	search: string;
	/** Half-open instant range; `null` leaves that side open. */
	from: Date | null;
	to: Date | null;
	page: number;
	limit?: number;
}

export interface PlatformActivityResult {
	events: PlatformActivityEvent[];
	totalCount: number;
	page: number;
	limit: number;
}

export interface PlatformAuditDashboardActivity {
	id: string;
	action: string;
	user_id: string | null;
	timestamp: string;
}

export interface PlatformAudit {
	listRecentActivity(input: { limit?: number }): Promise<PlatformAuditDashboardActivity[]>;
	listActivity(input: PlatformActivityInput): Promise<PlatformActivityResult>;
	listRecentByOrganization(input: { orgId: string; limit?: number }): Promise<PlatformAuditOrganizationActivity[]>;
	listRecentByUser(input: { userId: string; limit?: number }): Promise<PlatformAuditUserActivity[]>;
}
