import type { RequestEvent } from '@sveltejs/kit';
import { fail } from '$lib/server/core/errors';
import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { createPersonnelFollowUp, listPersonnelFollowUps } from '$lib/server/core/useCases/personnelFollowUps';

function routePersonnelId(event: RequestEvent): string {
	const personnelId = event.params.id;
	if (!personnelId) fail(400, 'Missing personnel id');
	return personnelId;
}

export const _getConfig: RouteConfig<{ personnelId: string }, unknown> = {
	policyAction: POLICY_ACTION_CATALOG.personnel.readSensitiveRecords,
	policyResource: { kind: 'unscoped' },
	parseInput: async (event) => ({ personnelId: routePersonnelId(event) }),
	fn: (ctx, input) => listPersonnelFollowUps(ctx, input.personnelId)
};

export const GET = handle(_getConfig);

export const _postConfig: RouteConfig<Record<string, unknown>, unknown> = {
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.personnel.manageRecords,
	policyResource: { kind: 'unscoped' },
	parseInput: async (event) => {
		const personnelId = routePersonnelId(event);
		const body = (await event.request.json()) as Record<string, unknown>;
		if (body.personnelId && body.personnelId !== personnelId) fail(400, 'Personnel id mismatch');
		return { ...body, personnelId };
	},
	fn: (ctx, input) => createPersonnelFollowUp(ctx, input)
};

export const POST = handle(_postConfig);
