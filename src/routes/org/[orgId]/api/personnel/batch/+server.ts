import type { PersonnelImportInput, PersonnelImportResult } from '$features/personnel/contracts';
import { importPersonnelBatch } from '$features/personnel/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { createRequestPersonnelRecordContext } from '$lib/server/adapters/requestContexts.server';
import { personnelSheetInput } from '../personnelSheetInput';

export const _postConfig = {
	context: createRequestPersonnelRecordContext,
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.personnel.importRecords,
	policyResource: { kind: 'unscoped' },
	input: personnelSheetInput,
	fn: (ctx, input) =>
		importPersonnelBatch(ctx, {
			records: input.records
		})
} satisfies RouteConfig<
	PersonnelImportInput,
	PersonnelImportResult,
	ReturnType<typeof createRequestPersonnelRecordContext>
>;

export const POST = handle(_postConfig);
