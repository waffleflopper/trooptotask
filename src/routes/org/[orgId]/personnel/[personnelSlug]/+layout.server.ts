import { listAvailabilityEntries, listStatusTypes } from '$features/calendar/index.server';
import type { PersonnelDetailLayoutStreams } from '$features/personnel/contracts';
import { loadAvailabilityToday, loadPersonnelDetailTabCounts } from '$features/personnel/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import { loadRequestPersonnelDetailHeader } from '$lib/server/adapters/personnelDetailHeaderLoad';
import { loadRequestPersonnelReadinessBadge } from '$lib/server/adapters/personnelReadinessLoad';
import { keepStreamedRejectionObserved } from '$lib/server/adapters/streamedWorkspace';
import { createRequestPersonnelDetailLayoutContext } from '$lib/server/adapters/requestContexts.server';
import { viewerToday } from '$lib/server/viewerDay.server';
import { VIEWER_DAY_DEPENDENCY } from '$lib/utils/viewerTimeZone';
import type { LayoutServerLoadEvent } from './$types';

type LoadWithContext = typeof loadWithContext;

export interface PersonnelDetailLayoutLoadDeps {
	loadWithContext?: LoadWithContext;
	loadReadinessBadge?: typeof loadRequestPersonnelReadinessBadge;
}

export function _createPersonnelDetailLayoutLoad(deps: PersonnelDetailLayoutLoadDeps = {}) {
	const loadWithContextFn = deps.loadWithContext ?? loadWithContext;
	const loadReadinessBadge = deps.loadReadinessBadge ?? loadRequestPersonnelReadinessBadge;
	return async (event: LayoutServerLoadEvent) => {
		const { params, locals, cookies, depends } = event;
		depends('app:personnel-detail-header', 'app:personnel-detail-counts', VIEWER_DAY_DEPENDENCY);
		const personnelDetailHeader = await loadRequestPersonnelDetailHeader(event, loadWithContextFn);
		const { person } = personnelDetailHeader;
		const today = viewerToday(cookies);
		const personnelDetailLayout = await loadWithContextFn(locals, cookies, params.orgId, {
			context: createRequestPersonnelDetailLayoutContext,
			policyAction: POLICY_ACTION_CATALOG.personnel.manageRecords,
			policyResource: { kind: 'unscoped' },
			fn: async (ctx): Promise<PersonnelDetailLayoutStreams> => ({
				availabilityToday: keepStreamedRejectionObserved(
					loadAvailabilityToday(
						ctx,
						person,
						today,
						(input) => listAvailabilityEntries(ctx.calendar, input),
						() => listStatusTypes(ctx.calendar.calendarCatalogs)
					)
				),
				tabCounts: keepStreamedRejectionObserved(loadPersonnelDetailTabCounts(ctx, person)),
				readinessBadge: loadReadinessBadge(event, person, today, loadWithContextFn)
			})
		});
		return {
			personnelDetailHeader,
			personnelDetailLayout,
			today,
			breadcrumbLabel: `${person.lastName}, ${person.firstName}`
		};
	};
}

export const load = _createPersonnelDetailLayoutLoad();
