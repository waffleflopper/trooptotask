import { createRequestCriticalTaskLibraryContext } from '$lib/server/adapters/featureRequestContexts.server';
import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { importIctTasksBatch } from '$features/critical-tasks/index.server';
import {
	ICT_IMPORT_MAX_RECORDS,
	ictTaskImportRecordSchema,
	type IctImportReply,
	type IctTask
} from '$features/critical-tasks/contracts';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { z } from 'zod';

const batchInput = z.object({
	records: z.array(ictTaskImportRecordSchema).min(1, 'records array is required').max(ICT_IMPORT_MAX_RECORDS)
});

export const _postConfig = {
	context: createRequestCriticalTaskLibraryContext,
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.criticalTasks.configureLibrary,
	input: batchInput,
	fn: (ctx, input) => importIctTasksBatch(ctx, input)
} satisfies RouteConfig<
	z.infer<typeof batchInput>,
	IctImportReply<IctTask>,
	ReturnType<typeof createRequestCriticalTaskLibraryContext>
>;

export const POST = handle(_postConfig);
