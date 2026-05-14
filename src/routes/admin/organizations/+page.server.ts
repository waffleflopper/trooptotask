import type { PageServerLoad } from './$types';
import { loadWithAdminContext } from '$lib/server/adapters/adminAdapter';
import { selectAllSupabaseRows } from '$lib/server/supabasePagination';

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

		const enrichedOrgs = await Promise.all(
			(orgs ?? []).map(async (org) => {
				const { count: memberCount } = await adminClient
					.from('organization_memberships')
					.select('*', { count: 'exact', head: true })
					.eq('organization_id', org.id);

				const { count: personnelCount } = await adminClient
					.from('personnel')
					.select('*', { count: 'exact', head: true })
					.eq('organization_id', org.id)
					.is('archived_at', null);

				const { data: ownerMembership } = await adminClient
					.from('organization_memberships')
					.select('user_id')
					.eq('organization_id', org.id)
					.eq('role', 'owner')
					.single();

				let ownerEmail = '';
				if (ownerMembership) {
					const {
						data: { user: ownerUser }
					} = await adminClient.auth.admin.getUserById(ownerMembership.user_id);
					ownerEmail = ownerUser?.email ?? '';
				}

				return {
					...org,
					effectiveTier: (org.gift_tier ?? org.tier ?? 'free') as string,
					memberCount: memberCount ?? 0,
					personnelCount: personnelCount ?? 0,
					ownerEmail,
					isSuspended: !!org.suspended_at
				};
			})
		);

		return { organizations: enrichedOrgs };
	}
});
