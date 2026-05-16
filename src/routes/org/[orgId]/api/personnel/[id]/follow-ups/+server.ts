import type { RequestEvent } from '@sveltejs/kit';
import { fail } from '$lib/server/core/errors';
import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { createPersonnelFollowUp, listPersonnelFollowUps } from '$lib/server/core/useCases/personnelFollowUps';

function routePersonnelId(event: RequestEvent): string {
	const personnelId = event.params.id;
	if (!personnelId) fail(400, 'Missing personnel id');
	return personnelId;
}

export const _getConfig: RouteConfig<{ personnelId: string }, unknown> = {
	permission: 'personnel',
	deferPolicyToUseCase: true,
	parseInput: async (event) => ({ personnelId: routePersonnelId(event) }),
	fn: (ctx, input) => listPersonnelFollowUps(ctx, input.personnelId)
};

export const GET = handle(_getConfig);

export const _postConfig: RouteConfig<Record<string, unknown>, unknown> = {
	permission: 'personnel',
	mutation: true,
	deferPolicyToUseCase: true,
	parseInput: async (event) => {
		const personnelId = routePersonnelId(event);
		const body = (await event.request.json()) as Record<string, unknown>;
		if (body.personnelId && body.personnelId !== personnelId) fail(400, 'Personnel id mismatch');
		return { ...body, personnelId };
	},
	fn: (ctx, input) => createPersonnelFollowUp(ctx, input)
};

export const POST = handle(_postConfig);
