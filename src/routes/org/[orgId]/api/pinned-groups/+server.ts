import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { pinGroup, replacePinnedGroups, unpinGroup } from '$features/personnel/index.server';

export const _postConfig: RouteConfig<Record<string, unknown>, unknown> = {
	policyAction: POLICY_ACTION_CATALOG.identity.updateOwnPreferences,
	mutation: true,

	fn: async (ctx, input) => {
		if (input.action === 'replace') {
			const groups = (input.groups as string[]) ?? [];
			return replacePinnedGroups(ctx, groups);
		}
		return pinGroup(ctx, {
			groupName: input.groupName as string,
			sortOrder: (input.sortOrder as number) ?? 0
		});
	}
};

export const POST = handle(_postConfig);

export const _deleteConfig: RouteConfig<Record<string, unknown>, unknown> = {
	policyAction: POLICY_ACTION_CATALOG.identity.updateOwnPreferences,
	mutation: true,

	fn: (ctx, input) => unpinGroup(ctx, input.groupName as string)
};

export const DELETE = handle(_deleteConfig);
