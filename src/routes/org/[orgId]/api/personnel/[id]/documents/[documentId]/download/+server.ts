import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { createRequestPersonnelArtifactsContext } from '$lib/server/adapters/requestContexts.server';
import type { RequestEvent } from '@sveltejs/kit';

import { createPersonnelDocumentDownloadUrl } from '$features/personnel/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { fail } from '$lib/errors';

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

export const _getConfig: RouteConfig<
	PersonnelDocumentDownloadInput,
	{ url: string },
	ReturnType<typeof createRequestPersonnelArtifactsContext>
> = {
	context: createRequestPersonnelArtifactsContext,
	policyAction: POLICY_ACTION_CATALOG.personnel.readSensitiveRecords,
	policyResource: { kind: 'unscoped' },
	parseInput: async (event: RequestEvent) => inputFromEvent(event),
	fn: (ctx, input) => createPersonnelDocumentDownloadUrl(ctx, input)
};

export const GET = handle(_getConfig);
