import { assertAuditQuerySuccess } from './providerError.server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createPlatformAudit, type PlatformAuditRecord, type PlatformAuditStore } from './platformAudit.server';
import type { PlatformAudit, PlatformAuditDashboardActivity } from './platformContracts';

type SupabaseResponse<T> = {
	data: T | null;
	error: unknown;
	count?: number | null;
};

type SupabaseAuditLogRow = {
	id: string;
	user_id: string | null;
	org_id: string | null;
	action: string;
	resource_type: string | null;
	resource_id: string | null;
	ip_address?: string | null;
	details?: Record<string, unknown> | null;
	severity: string;
	timestamp: string;
};

type SupabaseActionRow = {
	action: string;
};

const DISTINCT_ACTION_LOOKBACK_LIMIT = 1000;
const AUDIT_LOG_DASHBOARD_COLUMNS = 'id, action, user_id, timestamp';
const AUDIT_LOG_LIST_COLUMNS =
	'id, user_id, org_id, action, resource_type, resource_id, ip_address, details, severity, timestamp';
const AUDIT_LOG_RECENT_COLUMNS = 'id, user_id, org_id, action, resource_type, resource_id, severity, timestamp';

function mapAuditLog(row: SupabaseAuditLogRow): PlatformAuditRecord {
	return {
		id: row.id,
		userId: row.user_id,
		orgId: row.org_id,
		action: row.action,
		resourceType: row.resource_type,
		resourceId: row.resource_id,
		ipAddress: row.ip_address ?? null,
		details: row.details ?? null,
		severity: row.severity,
		timestamp: row.timestamp
	};
}

export function createSupabasePlatformAuditStore(supabase: SupabaseClient): PlatformAuditStore {
	return {
		async listRecentActivity(input) {
			const response = (await supabase
				.from('audit_logs')
				.select(AUDIT_LOG_DASHBOARD_COLUMNS)
				.order('timestamp', { ascending: false })
				.limit(input.limit)) as SupabaseResponse<PlatformAuditDashboardActivity[]>;
			assertAuditQuerySuccess('table audit_logs recent activity', response);
			return (response.data ?? []).map((row) => ({
				id: row.id,
				action: row.action,
				user_id: row.user_id,
				timestamp: row.timestamp
			}));
		},

		async listLogs(input) {
			let query = supabase.from('audit_logs').select(AUDIT_LOG_LIST_COLUMNS, { count: 'exact' });
			if (input.action) query = query.eq('action', input.action);
			if (input.severity) query = query.eq('severity', input.severity);
			if (input.orgId) query = query.eq('org_id', input.orgId);

			const response = (await query
				.order('timestamp', { ascending: false })
				.range(input.offset, input.offset + input.limit - 1)) as SupabaseResponse<SupabaseAuditLogRow[]>;
			assertAuditQuerySuccess('table audit_logs list', response);

			return {
				logs: ((response.data ?? []) as SupabaseAuditLogRow[]).map(mapAuditLog),
				totalCount: response.count ?? 0
			};
		},

		async listDistinctActions() {
			const response = (await supabase
				.from('audit_logs')
				.select('action')
				.order('timestamp', { ascending: false })
				.limit(DISTINCT_ACTION_LOOKBACK_LIMIT)) as SupabaseResponse<SupabaseActionRow[]>;
			assertAuditQuerySuccess('table audit_logs distinct actions', response);
			return [...new Set((response.data ?? []).map((row) => row.action))].sort();
		},

		async listRecentByOrganization(input) {
			const response = (await supabase
				.from('audit_logs')
				.select(AUDIT_LOG_RECENT_COLUMNS)
				.eq('org_id', input.orgId)
				.order('timestamp', { ascending: false })
				.limit(input.limit)) as SupabaseResponse<SupabaseAuditLogRow[]>;
			assertAuditQuerySuccess('table audit_logs recent by organization', response);
			return ((response.data ?? []) as SupabaseAuditLogRow[]).map(mapAuditLog);
		},

		async listRecentByUser(input) {
			const response = (await supabase
				.from('audit_logs')
				.select(AUDIT_LOG_RECENT_COLUMNS)
				.eq('user_id', input.userId)
				.order('timestamp', { ascending: false })
				.limit(input.limit)) as SupabaseResponse<SupabaseAuditLogRow[]>;
			assertAuditQuerySuccess('table audit_logs recent by user', response);
			return ((response.data ?? []) as SupabaseAuditLogRow[]).map(mapAuditLog);
		}
	};
}

export function createSupabasePlatformAudit(supabase: SupabaseClient): PlatformAudit {
	return createPlatformAudit({
		store: createSupabasePlatformAuditStore(supabase)
	});
}
