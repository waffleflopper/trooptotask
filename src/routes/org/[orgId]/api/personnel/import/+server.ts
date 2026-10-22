import {
	personnelImportRecordsInputSchema,
	type PersonnelImportRecordsInput,
	type PersonnelImportRecordsResult
} from '$features/personnel/contracts';
import { importPersonnelRecords } from '$features/personnel/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { createRequestPersonnelRecordContext } from '$lib/server/adapters/requestContexts.server';

export const _postConfig = {
	context: createRequestPersonnelRecordContext,
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.personnel.importRecords,
	policyResource: { kind: 'unscoped' },
	input: personnelImportRecordsInputSchema,
	fn: (ctx, input) => importPersonnelRecords(ctx, input)
} satisfies RouteConfig<
	PersonnelImportRecordsInput,
	PersonnelImportRecordsResult,
	ReturnType<typeof createRequestPersonnelRecordContext>
>;

export const POST = handle(_postConfig);
