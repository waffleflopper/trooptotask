import type { RequestEvent } from '@sveltejs/kit';
import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { fail } from '$lib/server/core/errors';
import { createPersonnelDocumentDownloadUrl } from '$lib/server/core/useCases/personnelDocuments';

interface PersonnelDocumentDownloadInput {
	personnelId: string;
	documentId: string;
}

function inputFromEvent(event: RequestEvent): PersonnelDocumentDownloadInput {
	const personnelId = event.params.id;
	const documentId = event.params.documentId;
	if (!personnelId) fail(400, 'Missing personnel id');
	if (!documentId) fail(400, 'Missing document id');
	return { personnelId, documentId };
}

export const _getConfig: RouteConfig<PersonnelDocumentDownloadInput, { url: string }> = {
	policyAction: POLICY_ACTION_CATALOG.personnel.readSensitiveRecords,
	policyResource: { kind: 'unscoped' },
	parseInput: async (event: RequestEvent) => inputFromEvent(event),
	fn: (ctx, input) => createPersonnelDocumentDownloadUrl(ctx, input)
};

export const GET = handle(_getConfig);
