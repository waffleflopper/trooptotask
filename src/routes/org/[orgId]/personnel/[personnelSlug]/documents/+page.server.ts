import type { PageServerLoadEvent } from './$types';
import type { PersonnelDetailHeader } from '$features/personnel/personnel-detail.types';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import { listPersonnelDocuments } from '$lib/server/core/useCases/personnelDocuments';

type LoadWithContext = typeof loadWithContext;

interface PersonnelDetailParentData {
	personnelDetailHeader: PersonnelDetailHeader;
}

export interface PersonnelDocumentsPageLoadDeps {
	loadWithContext?: LoadWithContext;
}

export function _createPersonnelDocumentsPageLoad(deps: PersonnelDocumentsPageLoadDeps = {}) {
	const loadWithContextFn = deps.loadWithContext ?? loadWithContext;

	return async ({ params, locals, cookies, parent, depends }: PageServerLoadEvent) => {
		depends('app:personnel-detail-documents');
		const parentData = (await parent()) as PersonnelDetailParentData;
		const personnelId = parentData.personnelDetailHeader.person.id;
		const records = await loadWithContextFn(locals, cookies, params.orgId, {
			policyAction: POLICY_ACTION_CATALOG.personnel.readSensitiveRecords,
			policyResource: { kind: 'unscoped' },
			fn: (ctx) => listPersonnelDocuments(ctx, personnelId)
		});

		return {
			orgId: params.orgId,
			personnelId,
			title: 'Documents',
			emptyState: 'No documents have been uploaded for this Soldier yet.',
			records
		};
	};
}

export const load = _createPersonnelDocumentsPageLoad();
