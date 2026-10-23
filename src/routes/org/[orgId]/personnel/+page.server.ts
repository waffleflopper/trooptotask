import { PERSONNEL_SIGNALS_DEPENDENCY, type RosterSignalRead } from '$features/personnel/contracts';
import { loadRosterSignals } from '$features/personnel/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import { createRequestRosterSignalsContext } from '$lib/server/adapters/requestContexts.server';
import { keepStreamedRejectionObserved } from '$lib/server/adapters/streamedWorkspace';
import { viewerToday } from '$lib/server/viewerDay.server';
import { VIEWER_DAY_DEPENDENCY } from '$lib/utils/viewerTimeZone';
import type { PageServerLoad, PageServerLoadEvent } from './$types';

type RosterSignalsRequest = Pick<PageServerLoadEvent, 'locals' | 'cookies' | 'params'>;

export interface PersonnelPageLoadDeps {
	loadSignals?: (request: RosterSignalsRequest, asOf: string) => Promise<RosterSignalRead>;
}

function loadSignals({ locals, cookies, params }: RosterSignalsRequest, asOf: string) {
	return loadWithContext(locals, cookies, params.orgId, {
		context: createRequestRosterSignalsContext,
		policyAction: POLICY_ACTION_CATALOG.personnel.viewRoster,
		policyResource: { kind: 'unscoped' },
		fn: (ctx) => loadRosterSignals(ctx, { asOf, personnelIds: null })
	});
}

/** The signals lane streams beside the layout's roster read, so a day or signals refresh rereads no roster. */
export function _createPersonnelPageLoad(deps: PersonnelPageLoadDeps = {}): PageServerLoad {
	return async (event) => {
		event.depends('app:org-core', VIEWER_DAY_DEPENDENCY, PERSONNEL_SIGNALS_DEPENDENCY);
		const asOf = viewerToday(event.cookies);
		return { asOf, rosterSignals: keepStreamedRejectionObserved((deps.loadSignals ?? loadSignals)(event, asOf)) };
	};
}

export const load: PageServerLoad = _createPersonnelPageLoad();
