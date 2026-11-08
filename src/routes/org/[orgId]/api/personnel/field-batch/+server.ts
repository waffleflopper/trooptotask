import { setPersonnelFieldBatch } from '$features/personnel/index.server';
import type { PersonnelFieldBatchResult } from '$features/personnel/contracts';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { createRequestPersonnelRecordContext } from '$lib/server/adapters/requestContexts.server';

export const _postConfig: RouteConfig<
	Record<string, unknown>,
	PersonnelFieldBatchResult,
	ReturnType<typeof createRequestPersonnelRecordContext>
> = {
	context: createRequestPersonnelRecordContext,
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.personnel.manageRecords,
	policyResource: { kind: 'unscoped' },
	fn: setPersonnelFieldBatch
};

export const POST = handle(_postConfig);
