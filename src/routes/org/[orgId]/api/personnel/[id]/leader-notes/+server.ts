import type { PersonnelLeaderNote, PersonnelLeaderNoteInput } from '$features/personnel/contracts';
import { createPersonnelLeaderNote, listPersonnelLeaderNotes } from '$features/personnel/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { fail } from '$lib/errors';
import { handle, readJsonBody, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { createRequestPersonnelLeaderNoteContext } from '$lib/server/adapters/requestContexts.server';
import type { RequestEvent } from '@sveltejs/kit';
import { routePersonnelId } from '../routeIds';

const MAX_NOTE_PAGE = 50;

interface LeaderNotePageInput {
	personnelId: string;
	limit?: number;
	before?: { createdAt: string; id: string };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const isTimestamp = (value: string) => ISO_TIMESTAMP.test(value) && !Number.isNaN(Date.parse(value));

/** `limit` with `before` (the last note already shown) reads the next older page; neither reads every note. */
function parseNotePage(event: RequestEvent): LeaderNotePageInput {
	const { searchParams } = event.url;
	const personnelId = routePersonnelId(event);
	const limitParam = searchParams.get('limit');
	const beforeCreatedAt = searchParams.get('beforeCreatedAt');
	const beforeId = searchParams.get('beforeId');
	if (limitParam === null && beforeCreatedAt === null && beforeId === null) return { personnelId };
	const limit = Number(limitParam);
	if (!Number.isInteger(limit) || limit < 1 || limit > MAX_NOTE_PAGE) fail(400, 'Invalid leader note page size');
	if ((beforeCreatedAt === null) !== (beforeId === null)) fail(400, 'Invalid leader note cursor');
	if (beforeCreatedAt !== null && beforeId !== null && !(isTimestamp(beforeCreatedAt) && UUID.test(beforeId)))
		fail(400, 'Invalid leader note cursor');
	return {
		personnelId,
		limit,
		...(beforeCreatedAt !== null && beforeId !== null ? { before: { createdAt: beforeCreatedAt, id: beforeId } } : {})
	};
}

export const _getConfig: RouteConfig<
	LeaderNotePageInput,
	PersonnelLeaderNote[],
	ReturnType<typeof createRequestPersonnelLeaderNoteContext>
> = {
	context: createRequestPersonnelLeaderNoteContext,
	policyAction: POLICY_ACTION_CATALOG.personnel.readSensitiveRecords,
	policyResource: { kind: 'unscoped' },
	parseInput: async (event: RequestEvent) => parseNotePage(event),
	fn: (ctx, input) => listPersonnelLeaderNotes(ctx, input.personnelId, input.limit, { before: input.before })
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
