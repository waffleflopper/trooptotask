import type { PageServerLoad } from './$types';
import { loadWithAdminContext } from '$lib/server/adapters/adminAdapter';
import { createSupabasePlatformAdministration } from '$lib/server/adapters/supabasePlatformAdministration';

export const load: PageServerLoad = loadWithAdminContext({
	fn: async (ctx) => createSupabasePlatformAdministration(ctx).dashboard()
});
