import { assertAuditQuerySuccess } from './providerError.server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createPlatformAudit, type PlatformAuditRecord, type PlatformAuditStore } from './platformAudit.server';
import type { PlatformActivityEvent, PlatformAudit, PlatformAuditDashboardActivity } from './platformContracts';

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

type SupabaseActivityRow = {
	id: string;
	timestamp: string;
	user_id: string | null;
	org_id: string | null;
	org_name: string | null;
	actor_email: string | null;
	actor_name: string | null;
	action: string;
	resource_type: string | null;
	resource_id: string | null;
	ip_address: string | null;
	details: Record<string, unknown> | null;
	severity: string;
	total_count: number;
	page_offset: number;
};

const AUDIT_LOG_DASHBOARD_COLUMNS = 'id, action, user_id, timestamp';
const AUDIT_LOG_RECENT_COLUMNS = 'id, user_id, org_id, action, resource_type, resource_id, severity, timestamp';

function mapActivityRow(row: SupabaseActivityRow): PlatformActivityEvent {
	return {
		id: row.id,
		timestamp: row.timestamp,
		action: row.action,
		severity: row.severity,
		userId: row.user_id,
		orgId: row.org_id,
		orgName: row.org_name,
		actorEmail: row.actor_email?.toLowerCase() ?? null,
		actorName: row.actor_name,
		resourceType: row.resource_type,
		resourceId: row.resource_id,
		ipAddress: row.ip_address,
		details: row.details
	};
}

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

		async listActivity(input) {
			const response = (await supabase.rpc('list_platform_activity', {
				p_actions: input.actions,
				p_prefixes: input.prefixes,
				p_search: input.search || null,
				p_from: input.from?.toISOString() ?? null,
				p_to: input.to?.toISOString() ?? null,
				p_limit: input.limit,
				p_offset: input.offset
			})) as SupabaseResponse<SupabaseActivityRow[]>;
			assertAuditQuerySuccess('function list_platform_activity', response);
			const rows = response.data ?? [];
			return {
				events: rows.map(mapActivityRow),
				totalCount: rows[0]?.total_count ?? 0,
				offset: rows[0]?.page_offset ?? 0
			};
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
