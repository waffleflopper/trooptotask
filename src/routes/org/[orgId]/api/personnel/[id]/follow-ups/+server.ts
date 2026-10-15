import { fail } from '$lib/errors';
import { handle, readJsonBody, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { createRequestPersonnelArtifactsContext } from '$lib/server/adapters/requestContexts.server';
import { routePersonnelId } from '../routeIds';

import { createPersonnelFollowUp, listPersonnelFollowUps } from '$features/personnel/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';

export const _getConfig: RouteConfig<
	{ personnelId: string },
	unknown,
	ReturnType<typeof createRequestPersonnelArtifactsContext>
> = {
	context: createRequestPersonnelArtifactsContext,
	policyAction: POLICY_ACTION_CATALOG.personnel.readSensitiveRecords,
	policyResource: { kind: 'unscoped' },
	parseInput: async (event) => ({ personnelId: routePersonnelId(event) }),
	fn: (ctx, input) => listPersonnelFollowUps(ctx, input.personnelId)
};

export const GET = handle(_getConfig);

export const _postConfig: RouteConfig<
	Record<string, unknown>,
	unknown,
	ReturnType<typeof createRequestPersonnelArtifactsContext>
> = {
	context: createRequestPersonnelArtifactsContext,
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.personnel.manageRecords,
	policyResource: { kind: 'unscoped' },
	parseInput: async (event) => {
		const personnelId = routePersonnelId(event);
		const body = await readJsonBody(event);
		if (body.personnelId && body.personnelId !== personnelId) fail(400, 'Personnel id mismatch');
		return { ...body, personnelId };
	},
	fn: (ctx, input) => createPersonnelFollowUp(ctx, input)
};

export const POST = handle(_postConfig);
