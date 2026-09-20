import type { SupabaseClient } from '@supabase/supabase-js';
import type { AdminContext } from './adminAdapter';
import {
	createPlatformAdministration,
	type PlatformAdministration,
	type PlatformAdministrationRecentActivity,
	type PlatformAdministrationSearchOrganizationRow,
	type PlatformAdministrationSearchUserRow,
	type PlatformAdministrationStore,
	type PlatformAdministrationUserStats
} from '$lib/server/core/useCases/platformAdministration';

type SupabaseResponse<T> = {
	data: T | null;
	error: unknown;
	count?: number | null;
	status?: number;
	statusText?: string;
};

type SupabaseQueryResult<T> = Promise<SupabaseResponse<T>>;

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

function assertSupabaseAffectedRow(operation: string, response: SupabaseResponse<unknown>): void {
	assertSupabaseSuccess(operation, response);
	if (response.count == null) {
		throw new Error(`${operation} failed: affected row count unavailable`);
	}
	if (response.count < 1) {
		throw new Error(`${operation} failed: no rows affected`);
	}
}

export function createSupabasePlatformAdministrationStore(supabase: SupabaseClient): PlatformAdministrationStore {
	return {
		async countPlatformUsers(): Promise<PlatformAdministrationUserStats | null> {
			const response = await supabase.rpc('count_platform_users');
			assertSupabaseSuccess('rpc count_platform_users', response);
			return (response.data as PlatformAdministrationUserStats | null) ?? null;
		},

		async listDailySignupsLast30Days() {
			const response = await supabase.rpc('daily_signups_last_30_days');
			assertSupabaseSuccess('rpc daily_signups_last_30_days', response);
			return (response.data as Array<{ date: string; count: number }> | null) ?? null;
		},

		async countOrganizations() {
			const response = await supabase.from('organizations').select('*', { count: 'exact', head: true });
			assertSupabaseSuccess('table organizations count', response);
			return response.count ?? null;
		},

		async countPendingAccessRequests() {
			const response = await supabase
				.from('access_requests')
				.select('*', { count: 'exact', head: true })
				.eq('status', 'pending');
			assertSupabaseSuccess('table access_requests pending count', response);
			return response.count ?? null;
		},

		async countPendingFeedback() {
			const response = await supabase
				.from('beta_feedback')
				.select('*', { count: 'exact', head: true })
				.eq('status', 'new');
			assertSupabaseSuccess('table beta_feedback new count', response);
			return response.count ?? null;
		},

		async listRecentActivity(limit: number): Promise<PlatformAdministrationRecentActivity[]> {
			const response = await supabase
				.from('audit_logs')
				.select('*')
				.order('timestamp', { ascending: false })
				.limit(limit);
			assertSupabaseSuccess('table audit_logs recent activity', response);
			return (response.data as PlatformAdministrationRecentActivity[] | null) ?? [];
		},

		async searchUsersByEmail(input): Promise<PlatformAdministrationSearchUserRow[]> {
			const response = await supabase.rpc('search_users_by_email', {
				search_query: input.query,
				max_results: input.maxResults
			});
			assertSupabaseSuccess('rpc search_users_by_email', response);
			return (response.data as PlatformAdministrationSearchUserRow[] | null) ?? [];
		},

		async countOrganizationsForUser(userId: string) {
			const response = await supabase
				.from('organization_memberships')
				.select('*', { count: 'exact', head: true })
				.eq('user_id', userId);
			assertSupabaseSuccess('table organization_memberships user count', response);
			return response.count ?? null;
		},

		async searchOrganizationsByName(input): Promise<PlatformAdministrationSearchOrganizationRow[]> {
			const response = (await supabase
				.from('organizations')
				.select('id, name')
				.ilike('name', `%${input.query}%`)
				.limit(input.maxResults)) as Awaited<SupabaseQueryResult<PlatformAdministrationSearchOrganizationRow[]>>;
			assertSupabaseSuccess('table organizations search', response);
			return (response.data as PlatformAdministrationSearchOrganizationRow[] | null) ?? [];
		},

		async countActivePersonnelForOrganization(organizationId: string) {
			const response = await supabase
				.from('personnel')
				.select('*', { count: 'exact', head: true })
				.eq('organization_id', organizationId)
				.is('archived_at', null);
			assertSupabaseSuccess('table personnel active count', response);
			return response.count ?? null;
		},

		async suspendUser(input) {
			const response = await supabase
				.from('user_suspensions')
				.upsert({ user_id: input.userId, suspended_by: input.suspendedBy, reason: input.reason });
			assertSupabaseSuccess('table user_suspensions upsert', response);
		},

		async unsuspendUser(userId) {
			const response = await supabase.from('user_suspensions').delete({ count: 'exact' }).eq('user_id', userId);
			assertSupabaseAffectedRow('table user_suspensions delete', response);
		},

		async suspendOrganization(input) {
			const response = await supabase
				.from('organizations')
				.update({ suspended_at: input.suspendedAt.toISOString() }, { count: 'exact' })
				.eq('id', input.organizationId);
			assertSupabaseAffectedRow('table organizations suspend update', response);
		},

		async unsuspendOrganization(organizationId) {
			const response = await supabase
				.from('organizations')
				.update({ suspended_at: null }, { count: 'exact' })
				.eq('id', organizationId);
			assertSupabaseAffectedRow('table organizations unsuspend update', response);
		}
	};
}

export function createSupabasePlatformAdministration(ctx: AdminContext): PlatformAdministration {
	return createPlatformAdministration({
		store: createSupabasePlatformAdministrationStore(ctx.adminClient),
		actorUserId: ctx.adminUser.id,
		audit: (event) => ctx.audit(event)
	});
}
