import type { LayoutServerLoad } from './$types';
import { createOrgLayoutLoad } from '$lib/server/core/useCases/createOrgLayoutLoad';
import type { CalendarBootstrap } from '$lib/server/core/useCases/calendarQuery';

export const load: LayoutServerLoad = createOrgLayoutLoad<CalendarBootstrap>({
	workspace: 'calendar',
	depends: ['app:org-core', 'app:calendar-data']
});
