import type { PageServerLoad } from './$types';
import { loadWithAdminContext } from '$lib/server/adapters/adminAdapter';
import { selectAllSupabaseRows } from '$lib/server/supabasePagination';
import { createSupabasePlatformMetrics } from '$lib/server/adapters/supabasePlatformMetrics';
import { displayOwnerMembership } from '$lib/server/core/useCases/platformMetrics';

export const load: PageServerLoad = loadWithAdminContext({
	page: 'organizations',
	fn: async (ctx) => {
		const { adminClient } = ctx;

		const { data: orgs, error: orgsError } = await selectAllSupabaseRows<{
			id: string;
			name: string;
			tier: string | null;
			gift_tier: string | null;
			suspended_at: string | null;
			created_at: string;
		}>(
			(from, to) =>
				adminClient
					.from('organizations')
					.select('id, name, tier, gift_tier, suspended_at, created_at')
					.order('created_at', { ascending: false })
					.range(from, to) as unknown as Promise<{
					data:
						| {
								id: string;
								name: string;
								tier: string | null;
								gift_tier: string | null;
								suspended_at: string | null;
								created_at: string;
						  }[]
						| null;
					error: unknown;
				}>
		);

		if (orgsError) {
			console.error('Admin orgs query failed:', orgsError);
		}

		const orgIds = (orgs ?? []).map((org) => org.id);
		const metrics = await createSupabasePlatformMetrics(ctx).getOrganizationMetrics(orgIds);

		const enrichedOrgs = (orgs ?? []).map((org) => {
			const ownerEmail = displayOwnerMembership(metrics.ownerMemberships.get(org.id));

			return {
				...org,
				effectiveTier: (org.gift_tier ?? org.tier ?? 'free') as string,
				memberCount: metrics.memberCounts.get(org.id) ?? 0,
				personnelCount: metrics.activePersonnelCounts.get(org.id) ?? 0,
				ownerEmail,
				isSuspended: !!org.suspended_at
			};
		});

		return { organizations: enrichedOrgs };
	}
});
