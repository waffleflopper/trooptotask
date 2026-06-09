import type { SupabaseClient } from '@supabase/supabase-js';
import type { AdminContext } from './adminAdapter';
import {
	createPlatformMetrics,
	type PlatformMetrics,
	type PlatformMetricsStore,
	type PlatformOwnerMembershipRow
} from '$lib/server/core/useCases/platformMetrics';

type MembershipCountRow = { organization_id: string; membership_count: number | string | null };
type PersonnelCountRow = { organization_id: string; personnel_count: number | string | null };
type OwnerMembershipMetricRow = {
	organization_id: string;
	owner_count: number | string | null;
	owner_user_id: string | null;
	owner_email: string | null;
};

function throwIfSupabaseError(error: unknown): void {
	if (!error) return;
	throw error;
}

function readCount(value: number | string | null): number {
	const count = typeof value === 'number' ? value : Number(value ?? 0);
	return Number.isFinite(count) && count > 0 ? count : 0;
}

function countRowsByOrganizationId<T extends string>(
	rows: Array<{ organization_id: string } & Record<T, number | string | null>>,
	countField: T
): Map<string, number> {
	const counts = new Map<string, number>();
	for (const row of rows) {
		counts.set(row.organization_id, readCount(row[countField]));
	}
	return counts;
}

function expandOwnerMembershipMetric(row: OwnerMembershipMetricRow): PlatformOwnerMembershipRow[] {
	const ownerCount = readCount(row.owner_count);
	if (ownerCount === 0) return [];
	if (ownerCount === 1) {
		if (!row.owner_user_id) {
			console.error('[admin] Single-owner Organization metric returned null user_id:', row.organization_id);
		}
		return [
			{
				organizationId: row.organization_id,
				userId: row.owner_user_id ?? '',
				email: row.owner_email
			}
		];
	}

	// The public store port still returns owner membership rows. Multiple-owner
	// callers only consume the count, so expand the aggregate count without
	// pulling every owner row back across the adapter boundary.
	return Array.from({ length: ownerCount }, (_, index) => ({
		organizationId: row.organization_id,
		userId: `${row.organization_id}:owner-${index + 1}`,
		email: null
	}));
}

export function createSupabasePlatformMetricsStore(supabase: SupabaseClient): PlatformMetricsStore {
	return {
		async countMembershipsByOrganization(organizationIds) {
			const { data, error } = (await supabase.rpc('count_memberships_by_organization', {
				p_org_ids: organizationIds
			})) as { data: MembershipCountRow[] | null; error: unknown };
			throwIfSupabaseError(error);
			return countRowsByOrganizationId(data ?? [], 'membership_count');
		},

		async countActivePersonnelByOrganization(organizationIds) {
			const { data, error } = (await supabase.rpc('count_personnel_by_organization', {
				p_org_ids: organizationIds
			})) as { data: PersonnelCountRow[] | null; error: unknown };
			throwIfSupabaseError(error);
			return countRowsByOrganizationId(data ?? [], 'personnel_count');
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
			const { data, error } = (await supabase.rpc('list_platform_owner_membership_metrics', {
				p_org_ids: organizationIds
			})) as { data: OwnerMembershipMetricRow[] | null; error: unknown };
			throwIfSupabaseError(error);
			return (data ?? []).flatMap(expandOwnerMembershipMetric);
		}
	};
}

export function createSupabasePlatformMetrics(ctx: AdminContext): PlatformMetrics {
	return createPlatformMetrics({
		store: createSupabasePlatformMetricsStore(ctx.adminClient)
	});
}
