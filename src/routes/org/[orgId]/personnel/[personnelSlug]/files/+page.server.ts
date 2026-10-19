import { listPersonnelCounselingRecords, listPersonnelDocuments } from '$features/personnel/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { loadWithContext } from '$lib/server/adapters/httpAdapter';
import { loadRequestPersonnelDetailHeader } from '$lib/server/adapters/personnelDetailHeaderLoad';
import { createRequestPersonnelArtifactsContext } from '$lib/server/adapters/requestContexts.server';
import type { PersonnelFilesPageData } from '$features/personnel/contracts';
import type { PageServerLoadEvent } from './$types';

type LoadWithContext = typeof loadWithContext;

export interface PersonnelFilesPageLoadDeps {
	loadWithContext?: LoadWithContext;
}

export function _createPersonnelFilesPageLoad(deps: PersonnelFilesPageLoadDeps = {}) {
	const loadWithContextFn = deps.loadWithContext ?? loadWithContext;

	return async (event: PageServerLoadEvent): Promise<PersonnelFilesPageData> => {
		const { params, locals, cookies } = event;
		const { person } = await loadRequestPersonnelDetailHeader(event, loadWithContextFn);
		const personnelId = person.id;
		const [counselings, documents] = await Promise.all([
			loadWithContextFn(locals, cookies, params.orgId, {
				context: createRequestPersonnelArtifactsContext,
				policyAction: POLICY_ACTION_CATALOG.personnel.readSensitiveRecords,
				policyResource: { kind: 'unscoped' },
				fn: (ctx) => listPersonnelCounselingRecords(ctx, personnelId)
			}),
			loadWithContextFn(locals, cookies, params.orgId, {
				context: createRequestPersonnelArtifactsContext,
				policyAction: POLICY_ACTION_CATALOG.personnel.readSensitiveRecords,
				policyResource: { kind: 'unscoped' },
				fn: (ctx) => listPersonnelDocuments(ctx, personnelId)
			})
		]);

		return {
			counselings: {
				orgId: params.orgId,
				personnelId,
				title: 'Counselings',
				emptyState: 'No counseling records have been added for this Soldier yet.',
				records: counselings
			},
			documents: {
				orgId: params.orgId,
				personnelId,
				title: 'Documents',
				emptyState: 'No documents have been uploaded for this Soldier yet.',
				records: documents
			}
		};
	};
}

export const load = _createPersonnelFilesPageLoad();
