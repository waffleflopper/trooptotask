import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import { loadRequestPersonnelDetailHeader } from '$lib/server/adapters/personnelDetailHeaderLoad';
import type { LayoutServerLoadEvent } from './$types';

type LoadWithContext = typeof loadWithContext;

export interface PersonnelDetailLayoutLoadDeps {
	loadWithContext?: LoadWithContext;
}

export function _createPersonnelDetailLayoutLoad(deps: PersonnelDetailLayoutLoadDeps = {}) {
	return async (event: LayoutServerLoadEvent) => {
		event.depends('app:personnel-detail-header');
		return { personnelDetailHeader: await loadRequestPersonnelDetailHeader(event, deps.loadWithContext) };
	};
}

export const load = _createPersonnelDetailLayoutLoad();
