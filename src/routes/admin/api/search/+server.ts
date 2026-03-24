import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isPlatformAdmin, validateSearchQuery } from '$lib/server/admin';
import { sanitizeString } from '$lib/server/validation';
import { getAdminClient } from '$lib/server/supabase';

export const GET: RequestHandler = async ({ url, locals }) => {
	const { user, supabase } = locals;
	if (!user) throw error(401, 'Not authenticated');

	const isAdmin = await isPlatformAdmin(supabase, user.id);
	if (!isAdmin) throw error(403, 'Not authorized');

	const rawQuery = url.searchParams.get('q') ?? '';
	const sanitized = sanitizeString(rawQuery, 100);
	const query = validateSearchQuery(sanitized);
	if (!query) return json({ users: [], organizations: [] });

	const adminClient = getAdminClient();

	// Search users by email via RPC (avoids listUsers 1000 cap)
	const { data: matchedUsers } = await adminClient.rpc('search_users_by_email', {
		search_query: query,
		max_results: 5
	});

	// Get org counts for matched users
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

	// Search organizations by name (parameterized via .ilike())
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

	return json({ users: userResults, organizations: orgResults });
};
