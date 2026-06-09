import type { SupabaseClient } from '@supabase/supabase-js';
import type { AdminContext } from './adminAdapter';
import { selectAllSupabaseRows } from '$lib/server/supabasePagination';
import {
	createPlatformMetrics,
	type PlatformMetrics,
	type PlatformMetricsStore,
	type PlatformOwnerMembershipRow
} from '$lib/server/core/useCases/platformMetrics';

type SupabaseQueryResult<T> = Promise<{ data: T[] | null; error: unknown }>;
type PersonnelCountRow = { organization_id: string; personnel_count: number | string | null };
type OwnerMembershipRow = { organization_id: string; user_id: string; email: string | null };

function throwIfSupabaseError(error: unknown): void {
	if (!error) return;
	throw error;
}

function countByOrganizationId(rows: Array<{ organization_id: string }>): Map<string, number> {
	const counts = new Map<string, number>();
	for (const row of rows) {
		counts.set(row.organization_id, (counts.get(row.organization_id) ?? 0) + 1);
	}
	return counts;
}

function countRowsByOrganizationId(rows: PersonnelCountRow[]): Map<string, number> {
	const counts = new Map<string, number>();
	for (const row of rows) {
		const count = typeof row.personnel_count === 'number' ? row.personnel_count : Number(row.personnel_count ?? 0);
		counts.set(row.organization_id, Number.isFinite(count) ? count : 0);
	}
	return counts;
}

function mapOwnerMembership(row: OwnerMembershipRow): PlatformOwnerMembershipRow {
	return {
		organizationId: row.organization_id,
		userId: row.user_id,
		email: row.email
	};
}

export function createSupabasePlatformMetricsStore(supabase: SupabaseClient): PlatformMetricsStore {
	return {
		async countMembershipsByOrganization(organizationIds) {
			const { data, error } = await selectAllSupabaseRows<{ organization_id: string }>(
				(from, to) =>
					supabase
						.from('organization_memberships')
						.select('organization_id')
						.in('organization_id', organizationIds)
						.range(from, to) as unknown as SupabaseQueryResult<{ organization_id: string }>
			);
			throwIfSupabaseError(error);
			return countByOrganizationId(data ?? []);
		},

		async countActivePersonnelByOrganization(organizationIds) {
			const { data, error } = (await supabase.rpc('count_personnel_by_organization', {
				p_org_ids: organizationIds
			})) as { data: PersonnelCountRow[] | null; error: unknown };
			throwIfSupabaseError(error);
			return countRowsByOrganizationId(data ?? []);
		},

		async countActivePersonnelForOrganization(organizationId) {
			const response = await supabase
				.from('personnel')
				.select('*', { count: 'exact', head: true })
				.eq('organization_id', organizationId)
				.is('archived_at', null);
			throwIfSupabaseError(response.error);
			return response.count ?? null;
		},

		async listOwnerMembershipsByOrganization(organizationIds) {
			const { data, error } = await selectAllSupabaseRows<OwnerMembershipRow>(
				(from, to) =>
					supabase
						.from('organization_memberships')
						.select('organization_id, user_id, email')
						.in('organization_id', organizationIds)
						.eq('role', 'owner')
						.range(from, to) as unknown as SupabaseQueryResult<OwnerMembershipRow>
			);
			throwIfSupabaseError(error);
			return (data ?? []).map(mapOwnerMembership);
		}
	};
}

export function createSupabasePlatformMetrics(ctx: AdminContext): PlatformMetrics {
	return createPlatformMetrics({
		store: createSupabasePlatformMetricsStore(ctx.adminClient)
	});
}
