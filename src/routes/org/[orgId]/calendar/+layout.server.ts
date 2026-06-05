import type { LayoutServerLoad } from './$types';
import { streamReadyFeatureLaneWorkspace } from '$lib/server/core/featureLaneWorkspaceLoad';
import {
	streamCalendarWorkspaceBootstrap,
	type CalendarWorkspaceRequestContext,
	type CalendarWorkspaceRouteData
} from '$features/calendar/server/calendarWorkspaceBootstrap';
import type { CalendarDateRange } from '$lib/server/core/useCases/calendarQuery';

export interface CalendarLayoutLoadDeps {
	streamCalendarWorkspace?: (context: CalendarWorkspaceRequestContext) => Promise<CalendarWorkspaceRouteData>;
}

export function _createCalendarLayoutLoad(deps: CalendarLayoutLoadDeps = {}): LayoutServerLoad {
	const streamCalendarWorkspace = deps.streamCalendarWorkspace ?? streamCalendarWorkspaceBootstrap;

	return async (event) =>
		streamReadyFeatureLaneWorkspace<CalendarWorkspaceRouteData, CalendarWorkspaceRequestContext>(event, {
			dependencies: ['app:org-core', 'app:calendar-data'],
			createContext: ({ locals, cookies, url }, shell) => ({
				locals,
				cookies,
				orgId: shell.org.id,
				...(isCalendarSettingsPath(url.pathname) && {
					specialDaysRange: createCalendarSettingsSpecialDaysRange(new Date())
				})
			}),
			streamWorkspace: streamCalendarWorkspace
		});
}

function isCalendarSettingsPath(pathname: string): boolean {
	return pathname.replace(/\/$/, '').endsWith('/calendar/settings');
}

function createCalendarSettingsSpecialDaysRange(anchorDate: Date): CalendarDateRange {
	const year = anchorDate.getFullYear();
	return {
		rangeStart: `${year - 1}-01-01`,
		rangeEnd: `${year + 2}-12-31`
	};
}

export const load: LayoutServerLoad = _createCalendarLayoutLoad();
