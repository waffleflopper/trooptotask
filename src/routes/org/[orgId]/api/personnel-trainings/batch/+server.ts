import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { importTrainingRecords } from '$lib/server/core/useCases/trainingRecordsBatch';

type ImportTrainingRecordsInput = Parameters<typeof importTrainingRecords>[1];

export const _postConfig: RouteConfig<ImportTrainingRecordsInput, unknown> = {
	permission: 'training',
	mutation: true,
	deferPolicyToUseCase: true,
	fn: (ctx, input) => importTrainingRecords(ctx, input)
};

export const POST = handle(_postConfig);
