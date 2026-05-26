import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { importPersonnelBatch } from '$lib/server/core/useCases/personnelBatch';

export const _postConfig: RouteConfig<Record<string, unknown>, unknown> = {
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.personnel.importRecords,
	policyResource: { kind: 'unscoped' },
	fn: (ctx, input) =>
		importPersonnelBatch(ctx, {
			records: input.records as Array<{
				rank: string;
				lastName: string;
				firstName: string;
				mos?: string | null;
				clinicRole?: string | null;
				groupName?: string | null;
				ets?: string | null;
				deros?: string | null;
			}>
		})
};

export const POST = handle(_postConfig);
