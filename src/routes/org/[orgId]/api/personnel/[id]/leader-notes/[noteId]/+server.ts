import type { RequestEvent } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { fail } from '$lib/server/core/errors';
import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
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
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.personnel.manageRecords,
	policyResource: { kind: 'unscoped' },
	parseInput: async (event) => ({ ...(await event.request.json()), ...routeIds(event) }),
	fn: (ctx, input) => {
		if (input.action === 'restore')
			return restorePersonnelLeaderNote(ctx, input as { personnelId: string; noteId: string });
		if (input.action === 'archive')
			return archivePersonnelLeaderNote(ctx, input as { personnelId: string; noteId: string });
		fail(400, 'Unsupported leader note action.');
	}
};

export const _deleteConfig: RouteConfig<{ personnelId: string; noteId: string }, { success: true }> = {
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.personnel.manageRecords,
	policyResource: { kind: 'unscoped' },
	parseInput: async (event) => routeIds(event),
	fn: async (ctx, input) => {
		await deletePersonnelLeaderNote(ctx, input);
		return { success: true };
	},
	formatOutput: (result) => json(result)
};

export const PATCH = handle(_patchConfig);
export const DELETE = handle(_deleteConfig);
