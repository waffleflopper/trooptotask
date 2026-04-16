import { handle } from '$lib/server/adapters/httpAdapter';
import { importIctCompletionsBatch } from '$lib/server/core/useCases/ictCompletionsBatch';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const POST = handle<any, unknown>({
	permission: 'training',
	mutation: true,
	fn: (ctx, input) => importIctCompletionsBatch(ctx, input)
});
