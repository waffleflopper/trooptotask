import { handle } from '$lib/server/adapters/httpAdapter';
import { importIctTasksBatch } from '$lib/server/core/useCases/ictTasksBatch';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';

export const POST = handle<Record<string, unknown>, unknown>({
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.criticalTasks.configureLibrary,
	fn: (ctx, input) =>
		importIctTasksBatch(ctx, {
			mode: input.mode as 'create-only' | 'upsert',
			records: (input.records as Array<{ rowNumber: number; values: Record<string, string> }>) ?? []
		})
});
