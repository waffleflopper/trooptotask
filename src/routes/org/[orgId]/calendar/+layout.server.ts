import type { LayoutServerLoad } from './$types';
import { getSupabaseClient } from '$lib/server/supabase';
import { fetchCalendarData } from '$lib/server/calendarData';

export const load: LayoutServerLoad = async ({ params, locals, cookies, depends }) => {
	depends('app:calendar-data');
	const { orgId } = params;
	const userId = locals.user?.id ?? null;
	const supabase = getSupabaseClient(locals, cookies);

	const calendarData = await fetchCalendarData(supabase, orgId, userId);

	return {
		...calendarData
	};
};
