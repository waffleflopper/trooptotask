import { permanentlyDeletePersonnelRecord } from '$features/personnel/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { fail } from '$lib/errors';
import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { createRequestPersonnelPermanentDeletionContext } from '$lib/server/adapters/requestContexts.server';

export const _deleteConfig: RouteConfig<
	Record<string, unknown>,
	unknown,
	ReturnType<typeof createRequestPersonnelPermanentDeletionContext>
> = {
	context: createRequestPersonnelPermanentDeletionContext,
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.personnel.permanentlyDeleteRecords,
	policyResource: { kind: 'unscoped' },
	fn: async (ctx, input) => {
		const { id } = input;
		if (!id || typeof id !== 'string') fail(400, 'Missing id');

		return permanentlyDeletePersonnelRecord(ctx, id, ctx.notifyPersonnelDeleted);
	}
};

export const DELETE = handle(_deleteConfig);
