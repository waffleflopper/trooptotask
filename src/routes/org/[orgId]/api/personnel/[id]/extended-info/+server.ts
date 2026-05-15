import type { RequestEvent } from '@sveltejs/kit';
import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { fail } from '$lib/server/core/errors';
import { updatePersonnelExtendedInfo } from '$lib/server/core/useCases/personnelExtendedInfo';

export const _putConfig: RouteConfig<Record<string, unknown>, unknown> = {
	permission: 'personnel',
	mutation: true,
	deferPolicyToUseCase: true,
	parseInput: async (event: RequestEvent) => {
		const body = (await event.request.json()) as Record<string, unknown>;
		const personnelId = event.params.id;
		if (!personnelId) fail(400, 'Missing personnel id');
		if (typeof body.personnelId === 'string' && body.personnelId !== personnelId) {
			fail(400, 'Personnel id mismatch');
		}
		return { ...body, personnelId };
	},
	fn: (ctx, input) => updatePersonnelExtendedInfo(ctx, input)
};

export const PUT = handle(_putConfig);
