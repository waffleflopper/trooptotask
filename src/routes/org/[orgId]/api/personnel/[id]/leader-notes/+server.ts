import type { PersonnelLeaderNote, PersonnelLeaderNoteInput } from '$features/personnel/contracts';
import { createPersonnelLeaderNote, listPersonnelLeaderNotes } from '$features/personnel/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { fail } from '$lib/errors';
import { handle, readJsonBody, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { createRequestPersonnelLeaderNoteContext } from '$lib/server/adapters/requestContexts.server';
import type { RequestEvent } from '@sveltejs/kit';
import { routePersonnelId } from '../routeIds';

export const _getConfig: RouteConfig<
	{ personnelId: string },
	PersonnelLeaderNote[],
	ReturnType<typeof createRequestPersonnelLeaderNoteContext>
> = {
	context: createRequestPersonnelLeaderNoteContext,
	policyAction: POLICY_ACTION_CATALOG.personnel.readSensitiveRecords,
	policyResource: { kind: 'unscoped' },
	parseInput: async (event: RequestEvent) => ({
		personnelId: routePersonnelId(event)
	}),
	fn: (ctx, input) => listPersonnelLeaderNotes(ctx, input.personnelId)
};

export const _postConfig: RouteConfig<
	PersonnelLeaderNoteInput,
	PersonnelLeaderNote,
	ReturnType<typeof createRequestPersonnelLeaderNoteContext>
> = {
	context: createRequestPersonnelLeaderNoteContext,
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.personnel.manageRecords,
	policyResource: { kind: 'unscoped' },
	parseInput: async (event: RequestEvent) => {
		const body = await readJsonBody(event);
		const personnelId = routePersonnelId(event);
		if (typeof body.personnelId === 'string' && body.personnelId !== personnelId) {
			fail(400, 'Personnel id mismatch');
		}
		return {
			personnelId,
			text: typeof body.text === 'string' ? body.text : ''
		};
	},
	fn: (ctx, input) => createPersonnelLeaderNote(ctx, input)
};

export const GET = handle(_getConfig);
export const POST = handle(_postConfig);
