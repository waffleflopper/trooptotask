import type { PageServerLoadEvent } from './$types';
import type { PersonnelDetailHeader } from '$features/personnel/personnel-detail.types';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import { listPersonnelCounselingRecords } from '$lib/server/core/useCases/personnelCounselingRecords';

type LoadWithContext = typeof loadWithContext;

interface PersonnelDetailParentData {
	personnelDetailHeader: PersonnelDetailHeader;
}

export interface PersonnelCounselingsPageLoadDeps {
	loadWithContext?: LoadWithContext;
}

export function _createPersonnelCounselingsPageLoad(deps: PersonnelCounselingsPageLoadDeps = {}) {
	const loadWithContextFn = deps.loadWithContext ?? loadWithContext;

	return async ({ params, locals, cookies, parent, depends }: PageServerLoadEvent) => {
		depends('app:personnel-detail-counselings');
		const parentData = (await parent()) as PersonnelDetailParentData;
		const personnelId = parentData.personnelDetailHeader.person.id;
		const records = await loadWithContextFn(locals, cookies, params.orgId, {
			permission: 'none',
			fn: (ctx) => listPersonnelCounselingRecords(ctx, personnelId)
		});

		return {
			orgId: params.orgId,
			personnelId,
			title: 'Counselings',
			emptyState: 'No counseling records have been added for this Soldier yet.',
			records
		};
	};
}

export const load = _createPersonnelCounselingsPageLoad();
