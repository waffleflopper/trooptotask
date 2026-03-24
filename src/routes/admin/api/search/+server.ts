import type { RequestHandler } from './$types';
import { validateSearchQuery } from '$lib/server/admin';
import { sanitizeString } from '$lib/server/validation';
import { adminHandle } from '$lib/server/adapters/adminAdapter';

export const GET: RequestHandler = adminHandle({
	parseInput: (event) => {
		const rawQuery = event.url.searchParams.get('q') ?? '';
		return sanitizeString(rawQuery, 100);
	},
	fn: async (ctx, rawQuery) => {
		const { adminClient } = ctx;
		const query = validateSearchQuery(rawQuery);
		if (!query) return { users: [], organizations: [] };

		const { data: matchedUsers } = await adminClient.rpc('search_users_by_email', {
			search_query: query,
			max_results: 5
		});

		const userResults = await Promise.all(
			(matchedUsers ?? []).map(async (u: { id: string; email: string }) => {
				const { count } = await adminClient
					.from('organization_memberships')
					.select('*', { count: 'exact', head: true })
					.eq('user_id', u.id);
				return {
					id: u.id,
					email: u.email ?? '',
					orgCount: count ?? 0
				};
			})
		);

		const { data: orgs } = await adminClient
			.from('organizations')
			.select('id, name, tier, demo_type')
			.is('demo_type', null)
			.ilike('name', `%${query}%`)
			.limit(5);

		const orgResults = await Promise.all(
			(orgs ?? []).map(async (org) => {
				const { count } = await adminClient
					.from('personnel')
					.select('*', { count: 'exact', head: true })
					.eq('organization_id', org.id)
					.is('archived_at', null);
				return {
					id: org.id,
					name: org.name,
					tier: org.tier ?? 'free',
					personnelCount: count ?? 0
				};
			})
		);

		return { users: userResults, organizations: orgResults };
	}
});
