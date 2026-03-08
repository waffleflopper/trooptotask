import type { PageServerLoad } from './$types';
import { getAdminClient } from '$lib/server/supabase';

export const load: PageServerLoad = async ({ locals, url }) => {
	const adminClient = getAdminClient();

	// Get search params
	const search = url.searchParams.get('search') || '';
	const page = parseInt(url.searchParams.get('page') || '1');
	const limit = 20;

	// Get all auth users (admin API)
	// Fetch multiple pages to handle > 1000 users
	let allUsers: { id: string; email?: string; created_at: string }[] = [];
	let fetchPage = 1;
	let hasMore = true;

	while (hasMore) {
		const { data: authResult, error: authError } = await adminClient.auth.admin.listUsers({
			page: fetchPage,
			perPage: 1000
		});

		if (authError) {
			console.error('[admin/users] auth.admin.listUsers error:', authError);
			return {
				users: [],
				totalCount: 0,
				page,
				limit,
				search,
				authError: authError.message
			};
		}

		const users = authResult?.users ?? [];
		allUsers = allUsers.concat(users);

		// If we got fewer than perPage results, we've reached the end
		if (users.length < 1000) {
			hasMore = false;
		} else {
			fetchPage++;
		}
	}

	// Apply search filter
	if (search) {
		const lowerSearch = search.toLowerCase();
		allUsers = allUsers.filter((u) => u.email?.toLowerCase().includes(lowerSearch));
	}

	// Sort by creation date (newest first)
	allUsers.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

	const totalCount = allUsers.length;
	const offset = (page - 1) * limit;
	const pagedUsers = allUsers.slice(offset, offset + limit);

	// Get organization counts for paged users
	const userIds = pagedUsers.map((u) => u.id);
	const { data: orgMemberships } = await adminClient
		.from('organization_memberships')
		.select('user_id')
		.in('user_id', userIds);

	const orgCountMap: Record<string, number> = {};
	(orgMemberships ?? []).forEach((m: { user_id: string }) => {
		orgCountMap[m.user_id] = (orgCountMap[m.user_id] || 0) + 1;
	});

	const users = pagedUsers.map((u) => ({
		id: u.id,
		email: u.email || null,
		organizationCount: orgCountMap[u.id] || 0,
		createdAt: u.created_at
	}));

	return {
		users,
		totalCount,
		page,
		limit,
		search,
		authError: null as string | null
	};
};
