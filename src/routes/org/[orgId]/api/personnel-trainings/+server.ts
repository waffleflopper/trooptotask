import { json } from '@sveltejs/kit';
import { handle } from '$lib/server/adapters/httpAdapter';
import { fail } from '$lib/server/core/errors';
import { validateUUID } from '$lib/server/validation';
import {
	createTrainingRecord,
	deleteTrainingRecord,
	updateTrainingRecord
} from '$lib/server/core/useCases/trainingRecords';

export const POST = handle<Record<string, unknown>, unknown>({
	permission: 'training',
	mutation: true,
	fn: (ctx, input) => createTrainingRecord(ctx, input)
});

export const PUT = handle<Record<string, unknown>, unknown>({
	permission: 'training',
	mutation: true,
	fn: (ctx, input) => updateTrainingRecord(ctx, input)
});

export const DELETE = handle<Record<string, unknown>, Record<string, unknown>>({
	permission: 'training',
	mutation: true,
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
});
