import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { createPinnedGroupUseCases } from '$lib/server/core/useCases/pinnedGroupCrud';

const useCases = createPinnedGroupUseCases();

export const _postConfig: RouteConfig<Record<string, unknown>, unknown> = {
	policyAction: POLICY_ACTION_CATALOG.identity.updateOwnPreferences,
	mutation: true,
	allowReadOnlyMutation: true,
	fn: async (ctx, input) => {
		if (input.action === 'replace') {
			const groups = (input.groups as string[]) ?? [];
			return useCases.replace(ctx, groups);
		}
		return useCases.pin(ctx, {
			groupName: input.groupName as string,
			sortOrder: (input.sortOrder as number) ?? 0
		});
	}
};

export const POST = handle(_postConfig);

export const _deleteConfig: RouteConfig<Record<string, unknown>, unknown> = {
	policyAction: POLICY_ACTION_CATALOG.identity.updateOwnPreferences,
	mutation: true,
	allowReadOnlyMutation: true,
	fn: (ctx, input) => useCases.unpin(ctx, input.groupName as string)
};

export const DELETE = handle(_deleteConfig);
