export interface OrganizationAuditRow {
	id: string;
	user_id: string | null;
	action: string;
	resource_type: string | null;
	resource_id: string | null;
	details: Record<string, unknown> | null;
	timestamp: string;
	/** Saved labels; absent or null on entries written before them. */
	actor_label?: string | null;
	record_label?: string | null;
	subject_personnel_id?: string | null;
	subject_label?: string | null;
	batch_id?: string | null;
}

export interface OrganizationAuditFilters {
	personId?: string;
	userId?: string;
	action?: string;
	since?: string;
	until?: string;
}

export interface OrganizationAuditStore {
	/**
	 * The newest `limit` entries after `after`, ordered on (timestamp, id) descending, and whether older ones remain.
	 * Both are unique together, so a page never repeats or skips an entry that shares a timestamp.
	 */
	listLogs(input: {
		orgId: string;
		filters: OrganizationAuditFilters;
		after?: { timestamp: string; id: string };
		limit: number;
	}): Promise<{ logs: OrganizationAuditRow[]; hasMore: boolean }>;
	listActions(orgId: string): Promise<string[]>;
}

export const ORGANIZATION_AUDIT_EXCLUDED_ACTIONS = [
	'auth.login_success',
	'auth.login_failure',
	'auth.mfa_verify',
	'security.rate_limit_violation'
];
