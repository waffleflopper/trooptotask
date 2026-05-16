import type { PageServerLoadEvent } from './$types';
import type { PersonnelDetailHeader } from '$features/personnel/personnel-detail.types';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import { listPersonnelLeaderNotes } from '$lib/server/core/useCases/personnelLeaderNotes';

type LoadWithContext = typeof loadWithContext;

interface PersonnelDetailParentData {
	personnelDetailHeader: PersonnelDetailHeader;
}

export interface PersonnelNotesPageLoadDeps {
	loadWithContext?: LoadWithContext;
}

export function _createPersonnelNotesPageLoad(deps: PersonnelNotesPageLoadDeps = {}) {
	const loadWithContextFn = deps.loadWithContext ?? loadWithContext;

	return async ({ params, locals, cookies, parent, depends }: PageServerLoadEvent) => {
		depends('app:personnel-detail-notes');
		const parentData = (await parent()) as PersonnelDetailParentData;
		const personnelId = parentData.personnelDetailHeader.person.id;
		const notes = await loadWithContextFn(locals, cookies, params.orgId, {
			permission: 'none',
			fn: (ctx) => listPersonnelLeaderNotes(ctx, personnelId)
		});

		return {
			orgId: params.orgId,
			personnelId,
			title: 'Notes',
			emptyState: 'No leader notes have been added for this Soldier yet.',
			notes
		};
	};
}

export const load = _createPersonnelNotesPageLoad();
