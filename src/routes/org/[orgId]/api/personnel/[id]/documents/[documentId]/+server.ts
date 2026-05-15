import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { fail } from '$lib/server/core/errors';
import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import {
	archivePersonnelDocument,
	deletePersonnelDocument,
	restorePersonnelDocument
} from '$lib/server/core/useCases/personnelDocuments';

function routeIds(event: RequestEvent): { personnelId: string; documentId: string } {
	const personnelId = event.params.id;
	const documentId = event.params.documentId;
	if (!personnelId) fail(400, 'Missing personnel id');
	if (!documentId) fail(400, 'Missing document id');
	return { personnelId, documentId };
}

export const _patchConfig: RouteConfig<Record<string, unknown>, unknown> = {
	permission: 'personnel',
	mutation: true,
	deferPolicyToUseCase: true,
	parseInput: async (event) => ({ ...(await event.request.json()), ...routeIds(event) }),
	fn: (ctx, input) => {
		if (input.action === 'restore')
			return restorePersonnelDocument(ctx, input as { personnelId: string; documentId: string });
		return archivePersonnelDocument(ctx, input as { personnelId: string; documentId: string });
	}
};

export const _deleteConfig: RouteConfig<{ personnelId: string; documentId: string }, { success: true }> = {
	permission: 'personnel',
	mutation: true,
	deferPolicyToUseCase: true,
	parseInput: async (event) => routeIds(event),
	fn: async (ctx, input) => {
		await deletePersonnelDocument(ctx, input);
		return { success: true };
	},
	formatOutput: (result) => json(result)
};

export const PATCH = handle(_patchConfig);
export const DELETE = handle(_deleteConfig);
