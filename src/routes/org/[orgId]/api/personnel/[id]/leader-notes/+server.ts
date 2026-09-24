import type { RequestEvent } from '@sveltejs/kit';
import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { fail } from '$lib/server/core/errors';
import { createPersonnelLeaderNote, listPersonnelLeaderNotes } from '$lib/server/core/useCases/personnelLeaderNotes';
import type { PersonnelLeaderNote, PersonnelLeaderNoteInput } from '$features/personnel/contracts';

function personnelIdFromEvent(event: RequestEvent): string {
	const personnelId = event.params.id;
	if (!personnelId) fail(400, 'Missing personnel id');
	return personnelId;
}

export const _getConfig: RouteConfig<{ personnelId: string }, PersonnelLeaderNote[]> = {
	policyAction: POLICY_ACTION_CATALOG.personnel.readSensitiveRecords,
	policyResource: { kind: 'unscoped' },
	parseInput: async (event: RequestEvent) => ({
		personnelId: personnelIdFromEvent(event)
	}),
	fn: (ctx, input) => listPersonnelLeaderNotes(ctx, input.personnelId)
};

export const _postConfig: RouteConfig<PersonnelLeaderNoteInput, PersonnelLeaderNote> = {
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.personnel.manageRecords,
	policyResource: { kind: 'unscoped' },
	parseInput: async (event: RequestEvent) => {
		const body = (await event.request.json()) as Record<string, unknown>;
		const personnelId = personnelIdFromEvent(event);
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
