import { createPersonnelLeaderNoteBatch, type PersonnelLogBatchResult } from '$features/personnel/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { createRequestPersonnelLogBatchContext } from '$lib/server/adapters/requestContexts.server';

export const _postConfig: RouteConfig<
	Record<string, unknown>,
	PersonnelLogBatchResult,
	ReturnType<typeof createRequestPersonnelLogBatchContext>
> = {
	context: createRequestPersonnelLogBatchContext,
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.personnel.manageRecords,
	policyResource: { kind: 'unscoped' },
	fn: createPersonnelLeaderNoteBatch
};

export const POST = handle(_postConfig);
