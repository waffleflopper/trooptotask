import type { RequestEvent } from '@sveltejs/kit';
import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { fail } from '$lib/server/core/errors';
import {
	createPersonnelDocument,
	listPersonnelDocuments,
	type PersonnelDocumentInput
} from '$lib/server/core/useCases/personnelDocuments';
import type { PersonnelDocument } from '$features/personnel/personnel-detail.types';

function personnelIdFromEvent(event: RequestEvent): string {
	const personnelId = event.params.id;
	if (!personnelId) fail(400, 'Missing personnel id');
	return personnelId;
}

export const _getConfig: RouteConfig<{ personnelId: string }, PersonnelDocument[]> = {
	policyAction: POLICY_ACTION_CATALOG.personnel.readSensitiveRecords,
	policyResource: { kind: 'unscoped' },
	parseInput: async (event: RequestEvent) => ({
		personnelId: personnelIdFromEvent(event)
	}),
	fn: (ctx, input) => listPersonnelDocuments(ctx, input.personnelId)
};

export const _postConfig: RouteConfig<PersonnelDocumentInput, PersonnelDocument> = {
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.personnel.manageRecords,
	policyResource: { kind: 'unscoped' },
	parseInput: async (event: RequestEvent) => {
		const formData = await event.request.formData();
		return {
			personnelId: personnelIdFromEvent(event),
			title: String(formData.get('title') ?? ''),
			file: formData.get('file') as File
		};
	},
	fn: (ctx, input) => createPersonnelDocument(ctx, input)
};

export const GET = handle(_getConfig);
export const POST = handle(_postConfig);
