import { handle } from '$lib/server/adapters/httpAdapter';
import { importTrainingRecords } from '$lib/server/core/useCases/trainingRecordsBatch';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const POST = handle<any, unknown>({
	permission: 'training',
	mutation: true,
	fn: (ctx, input) => importTrainingRecords(ctx, input)
});
