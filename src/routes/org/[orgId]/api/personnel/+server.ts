import { json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { handle } from '$lib/server/adapters/httpAdapter';
import { fail } from '$lib/server/core/errors';
import { validateUUID } from '$lib/server/validation';
import { createPersonnelUseCases } from '$lib/server/core/useCases/personnel';

const useCases = createPersonnelUseCases();

export const POST = handle<Record<string, unknown>, unknown>({
	permission: 'personnel',
	mutation: true,
	fn: (ctx, input) => useCases.create(ctx, input)
});

export const PUT = handle<Record<string, unknown>, unknown>({
	permission: 'personnel',
	mutation: true,
	fn: (ctx, input) => useCases.update(ctx, input)
});

export const DELETE = handle<Record<string, unknown>, Record<string, unknown>>({
	permission: 'personnel',
	mutation: true,
	fn: async (ctx, input) => {
		const id = input.id;
		if (!id || typeof id !== 'string') fail(400, 'Missing id');
		if (!validateUUID(id)) fail(400, 'Invalid resource ID');

		const result = await useCases.archive(ctx, id);
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
});

export const PATCH = handle<Record<string, unknown>, Record<string, unknown>>({
	permission: 'privileged',
	mutation: true,
	parseInput: async (event: RequestEvent) => {
		const body = await event.request.json();
		return {
			...body,
			_isSandbox: event.locals.user === undefined && event.cookies.get('sb-sandbox') !== undefined
		};
	},
	fn: async (ctx, input) => {
		const { action, id } = input;

		if (action !== 'restore') fail(400, 'Invalid action');
		if (!id || typeof id !== 'string') fail(400, 'Missing id');

		const capCheck = await ctx.subscription.canAddPersonnel();
		if (!capCheck.allowed) {
			return { message: capCheck.message };
		}

		const person = await ctx.store.findOne<{
			rank: string;
			first_name: string;
			last_name: string;
			archived_at: string | null;
		}>('personnel', ctx.auth.orgId, { id: id as string });

		if (!person) fail(404, 'Personnel not found');
		if (!person.archived_at) fail(400, 'Personnel is not archived');

		await ctx.store.update('personnel', ctx.auth.orgId, id as string, { archived_at: null });

		ctx.subscription.invalidateTierCache();

		ctx.audit.log({
			action: 'personnel.restored',
			resourceType: 'personnel',
			resourceId: id as string,
			details: {
				name: `${person.rank} ${person.last_name}, ${person.first_name}`
			}
		});

		return { success: true };
	},
	formatOutput: (result) => {
		if (result.message && !result.success) {
			return json(result, { status: 422 });
		}
		return json(result);
	}
});
