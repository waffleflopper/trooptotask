import type { PageServerLoad } from './$types';
import { loadWithAdminContext } from '$lib/server/adapters/adminAdapter';
import { selectAllSupabaseRows } from '$lib/server/supabasePagination';
import { TIER_CONFIG, type Tier } from '$lib/types/subscription';
import {
	type AdminMetricsClient,
	displayOwnerMembership,
	fetchOwnerMembershipsByOrganization,
	fetchPersonnelCountsByOrganization
} from '../adminOrganizationMetrics.server';

function getPersonnelCapForTier(tier: string): number | null {
	const config = TIER_CONFIG[tier as Tier];
	if (!config) return null;
	return config.personnelCap === Infinity ? null : config.personnelCap;
}

export const load: PageServerLoad = loadWithAdminContext({
	page: 'subscriptions',
	fn: async (ctx) => {
		const { adminClient } = ctx;

		const { data: orgs, error: orgsError } = await selectAllSupabaseRows<{
			id: string;
			name: string;
			tier: string | null;
			gift_tier: string | null;
			gift_expires_at: string | null;
			suspended_at: string | null;
			created_at: string;
		}>(
			(from, to) =>
				adminClient
					.from('organizations')
					.select('id, name, tier, gift_tier, gift_expires_at, suspended_at, created_at')
					.order('created_at', { ascending: false })
					.range(from, to) as unknown as Promise<{
					data:
						| {
								id: string;
								name: string;
								tier: string | null;
								gift_tier: string | null;
								gift_expires_at: string | null;
								suspended_at: string | null;
								created_at: string;
						  }[]
						| null;
					error: unknown;
				}>
		);

		if (orgsError) {
			console.error('Admin subscriptions query failed:', orgsError);
		}

		const orgIds = (orgs ?? []).map((org) => org.id);
		const metricsClient = adminClient as unknown as AdminMetricsClient;
		const [personnelCounts, ownerMemberships] = await Promise.all([
			fetchPersonnelCountsByOrganization(metricsClient, orgIds),
			fetchOwnerMembershipsByOrganization(metricsClient, orgIds)
		]);

		const enrichedOrgs = (orgs ?? []).map((org) => {
			const ownerEmail = displayOwnerMembership(ownerMemberships.get(org.id));

			const effectiveTier = (org.gift_tier ?? org.tier ?? 'free') as string;

			return {
				...org,
				effectiveTier,
				personnelCount: personnelCounts.get(org.id) ?? 0,
				personnelCap: getPersonnelCapForTier(effectiveTier),
				ownerEmail,
				isGifted: !!org.gift_tier,
				isSuspended: !!org.suspended_at
			};
		});

		return { subscriptions: enrichedOrgs };
	}
});
