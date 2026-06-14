import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { fail } from '$lib/server/core/errors';
import { createPersonnelUseCases } from '$lib/server/core/useCases/personnel';

const useCases = createPersonnelUseCases();

export const _deleteConfig: RouteConfig<Record<string, unknown>, unknown> = {
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.personnel.permanentlyDeleteRecords,
	policyResource: { kind: 'unscoped' },
	fn: async (ctx, input) => {
		const { id } = input;
		if (!id || typeof id !== 'string') fail(400, 'Missing id');

		return useCases.permanentlyDelete(ctx, id);
	}
};

export const DELETE = handle(_deleteConfig);
