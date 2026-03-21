import type { PageServerLoad } from './$types';
import { getSupabaseClient } from '$lib/server/supabase';
import { fetchPersonnelData } from '$lib/server/personnelPageServer';

export const load: PageServerLoad = async ({ params, locals, cookies, depends }) => {
	depends('app:shared-data');
	const { orgId } = params;
	const supabase = getSupabaseClient(locals, cookies);
	const userId = locals.user?.id ?? null;

	const { pinnedGroups, ratingSchemeEntries } = await fetchPersonnelData(supabase, orgId, userId);

	return {
		orgId,
		pinnedGroups,
		ratingSchemeEntries
	};
};
