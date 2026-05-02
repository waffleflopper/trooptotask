import { json } from '@sveltejs/kit';
import { handle } from '$lib/server/adapters/httpAdapter';
import { fail } from '$lib/server/core/errors';
import { validateUUID } from '$lib/server/validation';
import {
	createTrainingRecord,
	deleteTrainingRecord,
	updateTrainingRecord
} from '$lib/server/core/useCases/trainingRecords';

export const _postConfig = {
	permission: 'training',
	mutation: true,
	deferPolicyToUseCase: true,
	fn: (ctx, input) => createTrainingRecord(ctx, input)
} satisfies Parameters<typeof handle<Record<string, unknown>, unknown>>[0];

export const _putConfig = {
	permission: 'training',
	mutation: true,
	deferPolicyToUseCase: true,
	fn: (ctx, input) => updateTrainingRecord(ctx, input)
} satisfies Parameters<typeof handle<Record<string, unknown>, unknown>>[0];

export const _deleteConfig = {
	permission: 'training',
	mutation: true,
	deferPolicyToUseCase: true,
	fn: async (ctx, input) => {
		const id = input?.id;
		if (!id || typeof id !== 'string') fail(400, 'Missing id');
		if (!validateUUID(id)) fail(400, 'Invalid resource ID');

		const result = await deleteTrainingRecord(ctx, id);
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
} satisfies Parameters<typeof handle<Record<string, unknown>, Record<string, unknown>>>[0];

export const POST = handle(_postConfig);
export const PUT = handle(_putConfig);
export const DELETE = handle(_deleteConfig);
