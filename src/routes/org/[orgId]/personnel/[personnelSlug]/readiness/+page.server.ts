import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import { loadRequestPersonnelDetailHeader } from '$lib/server/adapters/personnelDetailHeaderLoad';
import { loadRequestPersonnelReadiness } from '$lib/server/adapters/personnelReadinessLoad';
import { viewerToday } from '$lib/server/viewerDay.server';
import { VIEWER_DAY_DEPENDENCY } from '$lib/utils/viewerTimeZone';
import type { PageServerLoadEvent } from './$types';

export interface PersonnelReadinessPageLoadDeps {
	loadWithContext?: typeof loadWithContext;
	loadReadiness?: typeof loadRequestPersonnelReadiness;
}

export function _createPersonnelReadinessPageLoad(deps: PersonnelReadinessPageLoadDeps = {}) {
	const loadWithContextFn = deps.loadWithContext ?? loadWithContext;
	const loadReadiness = deps.loadReadiness ?? loadRequestPersonnelReadiness;

	return async (event: PageServerLoadEvent) => {
		event.depends('app:personnel-detail-readiness', VIEWER_DAY_DEPENDENCY);
		const { person } = await loadRequestPersonnelDetailHeader(event, loadWithContextFn);
		const asOf = viewerToday(event.cookies);
		const { training, criticalTasks, evaluation, loss, onboarding } = await loadReadiness(
			event,
			person,
			asOf,
			loadWithContextFn
		);
		return { asOf, readiness: { training, criticalTasks, evaluation, loss, onboarding } };
	};
}

export const load = _createPersonnelReadinessPageLoad();
