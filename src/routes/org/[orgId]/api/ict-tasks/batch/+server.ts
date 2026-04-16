import { handle } from '$lib/server/adapters/httpAdapter';
import { importIctTasksBatch } from '$lib/server/core/useCases/ictTasksBatch';

export const POST = handle<Record<string, unknown>, unknown>({
	permission: 'training',
	mutation: true,
	fn: (ctx, input) =>
		importIctTasksBatch(ctx, {
			mode: input.mode as 'create-only' | 'upsert',
			records: (input.records as Array<{ rowNumber: number; values: Record<string, string> }>) ?? []
		})
});
