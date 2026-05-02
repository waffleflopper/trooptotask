import { json } from '@sveltejs/kit';
import { handle } from '$lib/server/adapters/httpAdapter';
import { fail } from '$lib/server/core/errors';
import { validateUUID } from '$lib/server/validation';
import { createRatingSchemeEntryUseCases } from '$lib/server/core/useCases/ratingSchemeEntryCrud';
import type { RouteConfig } from '$lib/server/adapters/httpAdapter';

const useCases = createRatingSchemeEntryUseCases();

export const _postConfig: RouteConfig<Record<string, unknown>, unknown> = {
	permission: 'none',
	mutation: true,
	allowReadOnlyMutation: true,
	fn: (ctx, input) => useCases.create(ctx, input)
};

export const _putConfig: RouteConfig<Record<string, unknown>, unknown> = {
	permission: 'none',
	mutation: true,
	allowReadOnlyMutation: true,
	fn: (ctx, input) => useCases.update(ctx, input)
};

export const _deleteConfig: RouteConfig<Record<string, unknown>, Record<string, unknown>> = {
	permission: 'none',
	mutation: true,
	allowReadOnlyMutation: true,
	fn: async (ctx, input) => {
		const id = input?.id;
		if (!id || typeof id !== 'string') fail(400, 'Missing id');
		if (!validateUUID(id)) fail(400, 'Invalid resource ID');

		const result = await useCases.remove(ctx, id);
		if (result?.requiresApproval) {
			return { requiresApproval: true };
		}
		return { success: true };
	},
	formatOutput: (result) => {
		if (result.requiresApproval) {
			return json(result, { status: 202 });
		}
		return json(result);
	}
};

export const POST = handle(_postConfig);
export const PUT = handle(_putConfig);
export const DELETE = handle(_deleteConfig);
