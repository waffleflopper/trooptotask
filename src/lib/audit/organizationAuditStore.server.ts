export interface OrganizationAuditRow {
	id: string;
	user_id: string | null;
	action: string;
	resource_type: string | null;
	resource_id: string | null;
	details: Record<string, unknown> | null;
	timestamp: string;
}

export interface OrganizationAuditStore {
	listLogs(input: { orgId: string; action?: string; offset: number; limit: number }): Promise<{
		logs: OrganizationAuditRow[];
		totalCount: number;
	}>;
	countRecent(input: { orgId: string; cutoff: string }): Promise<number>;
	listActions(orgId: string): Promise<string[]>;
}

export const ORGANIZATION_AUDIT_EXCLUDED_ACTIONS = [
	'auth.login_success',
	'auth.login_failure',
	'auth.mfa_verify',
	'security.rate_limit_violation'
];
