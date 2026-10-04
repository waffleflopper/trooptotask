import type { PersonnelBackfillInput, PersonnelBackfillResult } from '$features/personnel/contracts';
import { mergePersonnelBatch } from '$features/personnel/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { createRequestDataContext } from '$lib/server/adapters/requestContexts.server';

export const _postConfig: RouteConfig<
	PersonnelBackfillInput,
	PersonnelBackfillResult,
	ReturnType<typeof createRequestDataContext>
> = {
	context: createRequestDataContext,
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.personnel.mergeRecords,
	policyResource: { kind: 'unscoped' },
	fn: (ctx, input) => mergePersonnelBatch(ctx, input)
};

export const POST = handle(_postConfig);
