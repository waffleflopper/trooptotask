import {
	archivePersonnelLeaderNote,
	deletePersonnelLeaderNote,
	restorePersonnelLeaderNote,
	updatePersonnelLeaderNote
} from '$features/personnel/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { fail } from '$lib/errors';
import { handle, readJsonBody, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { createRequestPersonnelLeaderNoteContext } from '$lib/server/adapters/requestContexts.server';
import type { RequestEvent } from '@sveltejs/kit';
import { routeArtifactIds } from '../../routeIds';
import { json } from '@sveltejs/kit';

function routeIds(event: RequestEvent): { personnelId: string; noteId: string } {
	return routeArtifactIds(event, 'noteId', 'Leader note not found');
}

export const _patchConfig: RouteConfig<
	Record<string, unknown>,
	unknown,
	ReturnType<typeof createRequestPersonnelLeaderNoteContext>
> = {
	context: createRequestPersonnelLeaderNoteContext,
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.personnel.manageRecords,
	policyResource: { kind: 'unscoped' },
	parseInput: async (event) => ({ ...(await readJsonBody(event)), ...routeIds(event) }),
	fn: (ctx, input) => {
		if (input.action === 'restore')
			return restorePersonnelLeaderNote(ctx, input as { personnelId: string; noteId: string });
		if (input.action === 'archive')
			return archivePersonnelLeaderNote(ctx, input as { personnelId: string; noteId: string });
		if (input.action === undefined && typeof input.text === 'string') return updatePersonnelLeaderNote(ctx, input);
		fail(400, 'Unsupported leader note action.');
	}
};

export const _deleteConfig: RouteConfig<
	{ personnelId: string; noteId: string },
	{ success: true },
	ReturnType<typeof createRequestPersonnelLeaderNoteContext>
> = {
	context: createRequestPersonnelLeaderNoteContext,
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
