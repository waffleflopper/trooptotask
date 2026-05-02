import { json } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import { handle } from '$lib/server/adapters/httpAdapter';
import {
	listDeletionRequests,
	createDeletionRequest,
	cancelDeletionRequest,
	type CreateDeletionRequestInput
} from '$lib/server/core/useCases/deletionRequests';

export const GET = handle<{ status?: string }, unknown>({
	permission: 'none',
	deferPolicyToUseCase: true,
	parseInput: (event: RequestEvent) => ({
		status: event.url.searchParams.get('status') ?? undefined
	}),
	fn: (ctx, input) => listDeletionRequests(ctx, input.status ? { status: input.status } : undefined)
});

export const POST = handle<CreateDeletionRequestInput, unknown>({
	permission: 'none',
	mutation: true,
	deferPolicyToUseCase: true,
	parseInput: async (event: RequestEvent) => {
		const body = await event.request.json();
		return {
			...body,
			userEmail: event.locals.user?.email ?? 'unknown'
		};
	},
	fn: (ctx, input) => createDeletionRequest(ctx, input),
	formatOutput: (result) => json(result, { status: 201 })
});

export const DELETE = handle<Record<string, unknown>, unknown>({
	permission: 'none',
	mutation: true,
	deferPolicyToUseCase: true,
	fn: async (ctx, input) => {
		await cancelDeletionRequest(ctx, input.id as string);
		return { success: true };
	}
});
