import type { SupabaseClient } from '@supabase/supabase-js';
import type { AdminContext } from './adminAdapter';
import {
	createPlatformAudit,
	type PlatformAudit,
	type PlatformAuditRecord,
	type PlatformAuditStore
} from '$lib/server/core/useCases/platformAudit';

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
const AUDIT_LOG_LIST_COLUMNS =
	'id, user_id, org_id, action, resource_type, resource_id, ip_address, details, severity, timestamp';
const AUDIT_LOG_RECENT_COLUMNS = 'id, user_id, org_id, action, resource_type, resource_id, severity, timestamp';

function formatSupabaseError(error: unknown): string {
	if (error instanceof Error) return error.message;
	if (typeof error === 'string') return error;
	if (error && typeof error === 'object') {
		const candidate = error as { message?: unknown; code?: unknown };
		const message = typeof candidate.message === 'string' ? candidate.message : JSON.stringify(error);
		return typeof candidate.code === 'string' ? `${message} (${candidate.code})` : message;
	}
	return String(error);
}

function assertSupabaseSuccess<T>(operation: string, response: SupabaseResponse<T>): void {
	if (response.error) {
		throw new Error(`${operation} failed: ${formatSupabaseError(response.error)}`);
	}
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
		async listLogs(input) {
			let query = supabase.from('audit_logs').select(AUDIT_LOG_LIST_COLUMNS, { count: 'exact' });
			if (input.action) query = query.eq('action', input.action);
			if (input.severity) query = query.eq('severity', input.severity);
			if (input.orgId) query = query.eq('org_id', input.orgId);

			const response = (await query
				.order('timestamp', { ascending: false })
				.range(input.offset, input.offset + input.limit - 1)) as SupabaseResponse<SupabaseAuditLogRow[]>;
			assertSupabaseSuccess('table audit_logs list', response);

			return {
				logs: ((response.data ?? []) as SupabaseAuditLogRow[]).map(mapAuditLog),
				totalCount: response.count ?? 0
			};
		},

		async listDistinctActions() {
			const { data, error } = (await supabase
				.from('audit_logs')
				.select('action')
				.order('timestamp', { ascending: false })
				.limit(DISTINCT_ACTION_LOOKBACK_LIMIT)) as SupabaseResponse<SupabaseActionRow[]>;
			if (error) throw new Error(`table audit_logs distinct actions failed: ${formatSupabaseError(error)}`);
			return [...new Set((data ?? []).map((row) => row.action))].sort();
		},

		async listRecentByOrganization(input) {
			const response = (await supabase
				.from('audit_logs')
				.select(AUDIT_LOG_RECENT_COLUMNS)
				.eq('org_id', input.orgId)
				.order('timestamp', { ascending: false })
				.limit(input.limit)) as SupabaseResponse<SupabaseAuditLogRow[]>;
			assertSupabaseSuccess('table audit_logs recent by organization', response);
			return ((response.data ?? []) as SupabaseAuditLogRow[]).map(mapAuditLog);
		},

		async listRecentByUser(input) {
			const response = (await supabase
				.from('audit_logs')
				.select(AUDIT_LOG_RECENT_COLUMNS)
				.eq('user_id', input.userId)
				.order('timestamp', { ascending: false })
				.limit(input.limit)) as SupabaseResponse<SupabaseAuditLogRow[]>;
			assertSupabaseSuccess('table audit_logs recent by user', response);
			return ((response.data ?? []) as SupabaseAuditLogRow[]).map(mapAuditLog);
		}
	};
}

export function createSupabasePlatformAudit(ctx: AdminContext): PlatformAudit {
	return createPlatformAudit({
		store: createSupabasePlatformAuditStore(ctx.adminClient)
	});
}
