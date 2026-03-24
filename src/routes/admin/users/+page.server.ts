import type { PageServerLoad } from './$types';
import { loadWithAdminContext } from '$lib/server/adapters/adminAdapter';

export const load: PageServerLoad = loadWithAdminContext({
	page: 'users',
	fn: async (ctx, event) => {
		const { adminClient } = ctx;
		const { url } = event;

		const search = url.searchParams.get('search') || '';
		const page = parseInt(url.searchParams.get('page') || '1');
		const limit = 20;

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

			if (users.length < 1000) {
				hasMore = false;
			} else {
				fetchPage++;
			}
		}

		if (search) {
			const lowerSearch = search.toLowerCase();
			allUsers = allUsers.filter((u) => u.email?.toLowerCase().includes(lowerSearch));
		}

		allUsers.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

		const totalCount = allUsers.length;
		const offset = (page - 1) * limit;
		const pagedUsers = allUsers.slice(offset, offset + limit);

		const userIds = pagedUsers.map((u) => u.id);
		const [orgMembershipsResult, suspensionsResult] = await Promise.all([
			adminClient.from('organization_memberships').select('user_id').in('user_id', userIds),
			adminClient.from('user_suspensions').select('user_id')
		]);

		const orgCountMap: Record<string, number> = {};
		(orgMembershipsResult.data ?? []).forEach((m: { user_id: string }) => {
			orgCountMap[m.user_id] = (orgCountMap[m.user_id] || 0) + 1;
		});

		const suspendedIds = new Set((suspensionsResult.data ?? []).map((s: { user_id: string }) => s.user_id));

		const users = pagedUsers.map((u) => ({
			id: u.id,
			email: u.email || null,
			organizationCount: orgCountMap[u.id] || 0,
			createdAt: u.created_at,
			isSuspended: suspendedIds.has(u.id)
		}));

		return {
			users,
			totalCount,
			page,
			limit,
			search,
			authError: null as string | null
		};
	}
});
