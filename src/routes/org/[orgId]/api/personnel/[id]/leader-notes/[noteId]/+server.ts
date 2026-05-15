import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { fail } from '$lib/server/core/errors';
import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import {
	archivePersonnelLeaderNote,
	deletePersonnelLeaderNote,
	restorePersonnelLeaderNote
} from '$lib/server/core/useCases/personnelLeaderNotes';

function routeIds(event: RequestEvent): { personnelId: string; noteId: string } {
	const personnelId = event.params.id;
	const noteId = event.params.noteId;
	if (!personnelId) fail(400, 'Missing personnel id');
	if (!noteId) fail(400, 'Missing leader note id');
	return { personnelId, noteId };
}

export const _patchConfig: RouteConfig<Record<string, unknown>, unknown> = {
	permission: 'personnel',
	mutation: true,
	deferPolicyToUseCase: true,
	parseInput: async (event) => ({ ...(await event.request.json()), ...routeIds(event) }),
	fn: (ctx, input) => {
		if (input.action === 'restore')
			return restorePersonnelLeaderNote(ctx, input as { personnelId: string; noteId: string });
		return archivePersonnelLeaderNote(ctx, input as { personnelId: string; noteId: string });
	}
};

export const _deleteConfig: RouteConfig<{ personnelId: string; noteId: string }, { success: true }> = {
	permission: 'personnel',
	mutation: true,
	deferPolicyToUseCase: true,
	parseInput: async (event) => routeIds(event),
	fn: async (ctx, input) => {
		await deletePersonnelLeaderNote(ctx, input);
		return { success: true };
	},
	formatOutput: (result) => json(result)
};

export const PATCH = handle(_patchConfig);
export const DELETE = handle(_deleteConfig);
