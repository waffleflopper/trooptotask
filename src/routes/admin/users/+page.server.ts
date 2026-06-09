import type { PageServerLoad } from './$types';
import { loadWithAdminContext } from '$lib/server/adapters/adminAdapter';
import { createSupabasePlatformUserDirectory } from '$lib/server/adapters/supabasePlatformUserDirectory';

export const load: PageServerLoad = loadWithAdminContext({
	page: 'users',
	fn: async (ctx, event) => {
		const { url } = event;

		const search = url.searchParams.get('search') || '';
		const parsedPage = parseInt(url.searchParams.get('page') || '1');
		const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
		const limit = 20;

		return createSupabasePlatformUserDirectory(ctx).listUsers({ search, page, limit });
	}
});
