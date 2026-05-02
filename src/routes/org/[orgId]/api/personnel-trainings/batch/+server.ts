import { handle } from '$lib/server/adapters/httpAdapter';
import { importTrainingRecords } from '$lib/server/core/useCases/trainingRecordsBatch';

export const _postConfig = {
	permission: 'training',
	mutation: true,
	deferPolicyToUseCase: true,
	fn: (ctx, input) => importTrainingRecords(ctx, input)
} satisfies Parameters<typeof handle<Parameters<typeof importTrainingRecords>[1], unknown>>[0];

export const POST = handle(_postConfig);
