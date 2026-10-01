import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { mergePersonnelBatch } from '$features/personnel/index.server';
import type { PersonnelBackfillInput, PersonnelBackfillResult } from '$features/personnel/contracts';

export const _postConfig: RouteConfig<PersonnelBackfillInput, PersonnelBackfillResult> = {
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.personnel.mergeRecords,
	policyResource: { kind: 'unscoped' },
	fn: (ctx, input) => mergePersonnelBatch(ctx, input)
};

export const POST = handle(_postConfig);
