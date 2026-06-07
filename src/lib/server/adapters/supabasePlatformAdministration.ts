import type { SupabaseClient } from '@supabase/supabase-js';
import type { AdminContext } from './adminAdapter';
import { selectAllSupabaseRows } from '$lib/server/supabasePagination';
import {
	createPlatformAdministration,
	type PlatformAdministration,
	type PlatformAdministrationOrganizationTierRow,
	type PlatformAdministrationRecentActivity,
	type PlatformAdministrationSearchOrganizationRow,
	type PlatformAdministrationSearchUserRow,
	type PlatformAdministrationStore,
	type PlatformAdministrationUserStats
} from '$lib/server/core/useCases/platformAdministration';

type SupabaseQueryResult<T> = Promise<{ data: T | null; error: unknown; count?: number | null }>;

function throwOperationFailed(error: unknown): void {
	if (error) {
		throw new Error('Operation failed');
	}
}

export function createSupabasePlatformAdministrationStore(supabase: SupabaseClient): PlatformAdministrationStore {
	return {
		async countPlatformUsers(): Promise<PlatformAdministrationUserStats | null> {
			const { data } = await supabase.rpc('count_platform_users');
			return (data as PlatformAdministrationUserStats | null) ?? null;
		},

		async listDailySignupsLast30Days() {
			const { data } = await supabase.rpc('daily_signups_last_30_days');
			return (data as Array<{ date: string; count: number }> | null) ?? null;
		},

		async countOrganizations() {
			const { count } = await supabase.from('organizations').select('*', { count: 'exact', head: true });
			return count ?? null;
		},

		async listOrganizationTiers(): Promise<PlatformAdministrationOrganizationTierRow[]> {
			const { data } = await selectAllSupabaseRows<PlatformAdministrationOrganizationTierRow>(
				(from, to) =>
					supabase.from('organizations').select('tier, gift_tier').range(from, to) as unknown as Promise<{
						data: PlatformAdministrationOrganizationTierRow[] | null;
						error: unknown;
					}>
			);
			return data ?? [];
		},

		async countPendingAccessRequests() {
			const { count } = await supabase
				.from('access_requests')
				.select('*', { count: 'exact', head: true })
				.eq('status', 'pending');
			return count ?? null;
		},

		async countPendingFeedback() {
			const { count } = await supabase
				.from('beta_feedback')
				.select('*', { count: 'exact', head: true })
				.eq('status', 'new');
			return count ?? null;
		},

		async listRecentActivity(limit: number): Promise<PlatformAdministrationRecentActivity[]> {
			const { data } = await supabase
				.from('audit_logs')
				.select('*')
				.order('timestamp', { ascending: false })
				.limit(limit);
			return (data as PlatformAdministrationRecentActivity[] | null) ?? [];
		},

		async searchUsersByEmail(input): Promise<PlatformAdministrationSearchUserRow[]> {
			const { data } = await supabase.rpc('search_users_by_email', {
				search_query: input.query,
				max_results: input.maxResults
			});
			return (data as PlatformAdministrationSearchUserRow[] | null) ?? [];
		},

		async countOrganizationsForUser(userId: string) {
			const { count } = await supabase
				.from('organization_memberships')
				.select('*', { count: 'exact', head: true })
				.eq('user_id', userId);
			return count ?? null;
		},

		async searchOrganizationsByName(input): Promise<PlatformAdministrationSearchOrganizationRow[]> {
			const { data } = (await supabase
				.from('organizations')
				.select('id, name, tier')
				.ilike('name', `%${input.query}%`)
				.limit(input.maxResults)) as Awaited<SupabaseQueryResult<PlatformAdministrationSearchOrganizationRow[]>>;
			return (data as PlatformAdministrationSearchOrganizationRow[] | null) ?? [];
		},

		async countActivePersonnelForOrganization(organizationId: string) {
			const { count } = await supabase
				.from('personnel')
				.select('*', { count: 'exact', head: true })
				.eq('organization_id', organizationId)
				.is('archived_at', null);
			return count ?? null;
		},

		async suspendUser(input) {
			const { error } = await supabase
				.from('user_suspensions')
				.upsert({ user_id: input.userId, suspended_by: input.suspendedBy, reason: input.reason });
			throwOperationFailed(error);
		},

		async unsuspendUser(userId) {
			const { error } = await supabase.from('user_suspensions').delete().eq('user_id', userId);
			throwOperationFailed(error);
		},

		async suspendOrganization(input) {
			const { error } = await supabase
				.from('organizations')
				.update({ suspended_at: input.suspendedAt.toISOString() })
				.eq('id', input.organizationId);
			throwOperationFailed(error);
		},

		async unsuspendOrganization(organizationId) {
			const { error } = await supabase.from('organizations').update({ suspended_at: null }).eq('id', organizationId);
			throwOperationFailed(error);
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
