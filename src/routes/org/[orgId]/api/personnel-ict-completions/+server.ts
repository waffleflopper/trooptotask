import { createRequestIctCompletionContext } from '$lib/server/adapters/featureRequestContexts.server';
import {
	createPersonnelIctCompletion,
	updatePersonnelIctCompletion,
	preparePersonnelIctCompletionDeletion
} from '$features/critical-tasks/index.server';
import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import type { PersonnelIctCompletion } from '$features/critical-tasks/contracts';

const admission = {
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.criticalTasks.recordCompletion,
	policyResource: { kind: 'unscoped' as const }
};

export const _postConfig: RouteConfig<
	Record<string, unknown>,
	PersonnelIctCompletion,
	ReturnType<typeof createRequestIctCompletionContext>
> = {
	context: createRequestIctCompletionContext,
	...admission,
	fn: createPersonnelIctCompletion
};

export const _putConfig: RouteConfig<
	Record<string, unknown>,
	PersonnelIctCompletion,
	ReturnType<typeof createRequestIctCompletionContext>
> = {
	context: createRequestIctCompletionContext,
	...admission,
	fn: updatePersonnelIctCompletion
};

export const _deleteConfig: RouteConfig<
	Record<string, unknown>,
	{ success: true },
	ReturnType<typeof createRequestIctCompletionContext>
> = {
	context: createRequestIctCompletionContext,
	...admission,
	fn: async (ctx, input) => {
		const remove = await preparePersonnelIctCompletionDeletion(ctx, input.id);
		await remove();
		return { success: true };
	}
};

export const POST = handle(_postConfig);
export const PUT = handle(_putConfig);
export const DELETE = handle(_deleteConfig);
