import { setPersonnelAwardTrackingAcknowledged } from '$features/personnel/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { handle, readJsonBody, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { createRequestPersonnelAwardContext } from '$lib/server/adapters/requestContexts.server';
import type { RequestEvent } from '@sveltejs/kit';
import { routePersonnelId } from '../routeIds';

type PersonnelAwardTrackingResult = Awaited<ReturnType<typeof setPersonnelAwardTrackingAcknowledged>>;

interface PersonnelAwardTrackingInput {
	personnelId: string;
	acknowledged: boolean;
}

export const _postConfig: RouteConfig<
	PersonnelAwardTrackingInput,
	PersonnelAwardTrackingResult,
	ReturnType<typeof createRequestPersonnelAwardContext>
> = {
	context: createRequestPersonnelAwardContext,
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.personnel.manageRecords,
	policyResource: { kind: 'unscoped' },
	parseInput: async (event: RequestEvent) => {
		const body = await readJsonBody(event);
		return {
			personnelId: routePersonnelId(event),
			acknowledged: body.acknowledged === true
		};
	},
	fn: (ctx, input) => setPersonnelAwardTrackingAcknowledged(ctx, input)
};

export const POST = handle(_postConfig);
