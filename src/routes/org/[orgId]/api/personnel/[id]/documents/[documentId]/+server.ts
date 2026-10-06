import { fail } from '$lib/errors';
import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { createRequestPersonnelArtifactsContext } from '$lib/server/adapters/requestContexts.server';
import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';

import {
	archivePersonnelDocument,
	deletePersonnelDocument,
	restorePersonnelDocument
} from '$features/personnel/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';

function routeIds(event: RequestEvent): { personnelId: string; documentId: string } {
	const personnelId = event.params.id;
	const documentId = event.params.documentId;
	if (!personnelId) fail(400, 'Missing personnel id');
	if (!documentId) fail(400, 'Missing document id');
	return { personnelId, documentId };
}

export const _patchConfig: RouteConfig<
	Record<string, unknown>,
	unknown,
	ReturnType<typeof createRequestPersonnelArtifactsContext>
> = {
	context: createRequestPersonnelArtifactsContext,
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.personnel.manageRecords,
	policyResource: { kind: 'unscoped' },
	parseInput: async (event) => ({ ...(await event.request.json()), ...routeIds(event) }),
	fn: (ctx, input) => {
		if (input.action === 'restore')
			return restorePersonnelDocument(ctx, input as { personnelId: string; documentId: string });
		if (input.action === 'archive')
			return archivePersonnelDocument(ctx, input as { personnelId: string; documentId: string });
		fail(400, 'Unsupported document action.');
	}
};

export const _deleteConfig: RouteConfig<
	{ personnelId: string; documentId: string },
	{ success: true },
	ReturnType<typeof createRequestPersonnelArtifactsContext>
> = {
	context: createRequestPersonnelArtifactsContext,
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.personnel.manageRecords,
	policyResource: { kind: 'unscoped' },
	parseInput: async (event) => routeIds(event),
	fn: async (ctx, input) => {
		await deletePersonnelDocument(ctx, input);
		return { success: true };
	},
	formatOutput: (result) => json(result)
};

export const PATCH = handle(_patchConfig);
export const DELETE = handle(_deleteConfig);
