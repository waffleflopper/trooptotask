import {
	rosterSignalsRequestSchema,
	type RosterSignalRead,
	type RosterSignalsRequest
} from '$features/personnel/contracts';
import { loadRosterSignals } from '$features/personnel/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { handle, privateJson, readJsonBody, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { createRequestRosterSignalsContext } from '$lib/server/adapters/requestContexts.server';
import { viewerToday } from '$lib/server/viewerDay.server';
import { fail } from '$lib/errors';
import type { RequestEvent } from '@sveltejs/kit';

type RosterSignalsInput = RosterSignalsRequest & { asOf: string };

export const _postConfig = {
	context: createRequestRosterSignalsContext,
	policyAction: POLICY_ACTION_CATALOG.personnel.viewRoster,
	policyResource: { kind: 'unscoped' },
	parseInput: async (event: RequestEvent) => {
		const parsed = rosterSignalsRequestSchema.safeParse(await readJsonBody(event));
		if (!parsed.success) fail(400, 'Invalid Personnel IDs');
		return { ...parsed.data, asOf: viewerToday(event.cookies) };
	},
	fn: (ctx, { asOf, personnelIds }) => loadRosterSignals(ctx, { asOf, personnelIds }),
	formatOutput: privateJson
} satisfies RouteConfig<RosterSignalsInput, RosterSignalRead, ReturnType<typeof createRequestRosterSignalsContext>>;

export const POST = handle(_postConfig);
