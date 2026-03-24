import type { LayoutServerLoad } from './$types';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import { fetchCalendarData } from '$lib/server/core/useCases/calendarQuery';
import { getActiveOnboardingPersonnelIds } from '$lib/server/core/useCases/onboardingCalendarQuery';
import { formatDate } from '$lib/utils/dates';

export const load: LayoutServerLoad = async ({ params, locals, cookies, depends }) => {
	depends('app:calendar-data');
	const { orgId } = params;

	// Date range for calendar data (3 months past, 6 months future)
	const now = new Date();
	const rangeStart = formatDate(new Date(now.getFullYear(), now.getMonth() - 3, 1));
	const rangeEnd = formatDate(new Date(now.getFullYear(), now.getMonth() + 7, 0));

	return loadWithContext(locals, cookies, orgId, {
		permission: 'calendar',
		fn: async (ctx) => {
			const [calendarData, activeOnboardingPersonnelIds] = await Promise.all([
				fetchCalendarData(ctx, { rangeStart, rangeEnd }),
				getActiveOnboardingPersonnelIds(ctx)
			]);

			return {
				...calendarData,
				activeOnboardingPersonnelIds
			};
		}
	});
};
