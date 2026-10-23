import { createRequestIctCompletionContext } from '$lib/server/adapters/featureRequestContexts.server';
import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { importIctCompletionsBatch } from '$features/critical-tasks/index.server';
import {
	ICT_IMPORT_MAX_RECORDS,
	ictCompletionImportRecordSchema,
	type IctImportReply,
	type PersonnelIctCompletion
} from '$features/critical-tasks/contracts';
import { z } from 'zod';

const batchInput = z.object({
	records: z.array(ictCompletionImportRecordSchema).min(1, 'records array is required').max(ICT_IMPORT_MAX_RECORDS)
});

export const _postConfig = {
	context: createRequestIctCompletionContext,
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.criticalTasks.recordCompletion,
	policyResource: { kind: 'unscoped' },
	input: batchInput,
	fn: (ctx, input) => importIctCompletionsBatch(ctx, input)
} satisfies RouteConfig<
	z.infer<typeof batchInput>,
	IctImportReply<PersonnelIctCompletion>,
	ReturnType<typeof createRequestIctCompletionContext>
>;

export const POST = handle(_postConfig);
