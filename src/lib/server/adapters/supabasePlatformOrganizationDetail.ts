import type { SupabaseClient } from '@supabase/supabase-js';
import type { AdminContext } from './adminAdapter';
import { createSupabasePlatformAudit } from './supabasePlatformAudit';
import { createSupabasePlatformMembershipAdministration } from './supabasePlatformMembershipAdministration';
import { createSupabasePlatformMetrics } from './supabasePlatformMetrics';
import {
	createPlatformOrganizationDetail,
	type PlatformOrganizationDetail,
	type PlatformOrganizationDetailOrganizationRow,
	type PlatformOrganizationDetailStore
} from '$lib/server/core/useCases/platformOrganizationDetail';

const ORGANIZATION_SELECT = 'id, name, suspended_at, created_at';

type SupabaseMaybeSingleResponse<T> = {
	data: T | null;
	error: unknown;
};

function throwIfSupabaseError(error: unknown): void {
	if (!error) return;
	throw error;
}

export function createSupabasePlatformOrganizationDetailStore(
	supabase: SupabaseClient
): PlatformOrganizationDetailStore {
	return {
		async getOrganizationById(orgId) {
			const response = (await supabase
				.from('organizations')
				.select(ORGANIZATION_SELECT)
				.eq('id', orgId)
				.maybeSingle<PlatformOrganizationDetailOrganizationRow>()) as SupabaseMaybeSingleResponse<PlatformOrganizationDetailOrganizationRow>;
			throwIfSupabaseError(response.error);
			return response.data;
		}
	};
}

export function createSupabasePlatformOrganizationDetail(ctx: AdminContext): PlatformOrganizationDetail {
	return createPlatformOrganizationDetail({
		store: createSupabasePlatformOrganizationDetailStore(ctx.adminClient),
		adminRole: ctx.adminUser.role,
		membershipAdministration: createSupabasePlatformMembershipAdministration(ctx),
		metrics: createSupabasePlatformMetrics(ctx),
		audit: createSupabasePlatformAudit(ctx)
	});
}
