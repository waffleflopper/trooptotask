import type { LayoutServerLoad } from './$types';
import { getSupabaseClient } from '$lib/server/supabase';
import { fetchCalendarData } from '$lib/server/calendarData';
import { buildLayoutContext } from '$lib/server/adapters/httpAdapter';
import { getActiveOnboardingPersonnelIds } from '$lib/server/core/useCases/onboardingCalendarQuery';

export const load: LayoutServerLoad = async ({ params, locals, cookies, depends }) => {
	depends('app:calendar-data');
	const { orgId } = params;
	const userId = locals.user?.id ?? null;
	const supabase = getSupabaseClient(locals, cookies);

	const [calendarData, ctx] = await Promise.all([
		fetchCalendarData(supabase, orgId, userId),
		buildLayoutContext(locals, cookies, orgId)
	]);

	const activeOnboardingPersonnelIds = await getActiveOnboardingPersonnelIds(ctx);

	return {
		...calendarData,
		activeOnboardingPersonnelIds
	};
};
