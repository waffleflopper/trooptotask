import { z } from 'zod';
import { pinGroup, replacePinnedGroups, unpinGroup } from '$features/personnel/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { createRequestSelfPinContext } from '$lib/server/adapters/requestContexts.server';

const groupName = z.string('Choose a Group').min(1, 'Choose a Group');

const postInput = z.discriminatedUnion('action', [
	z.object({ action: z.literal('replace'), groups: z.array(groupName, 'Pinned Groups must be a list of Group names') }),
	z.object({ action: z.undefined(), groupName, sortOrder: z.number().int().nonnegative().optional() })
]);

export const _postConfig: RouteConfig<
	z.infer<typeof postInput>,
	unknown,
	ReturnType<typeof createRequestSelfPinContext>
> = {
	context: createRequestSelfPinContext,
	policyAction: POLICY_ACTION_CATALOG.identity.updateOwnPreferences,
	mutation: true,
	input: postInput,

	fn: async (ctx, input) => {
		if (input.action === 'replace') return replacePinnedGroups(ctx, input.groups);
		return pinGroup(ctx, { groupName: input.groupName, sortOrder: input.sortOrder ?? 0 });
	}
};

export const POST = handle(_postConfig);

export const _deleteConfig: RouteConfig<
	{ groupName: string },
	unknown,
	ReturnType<typeof createRequestSelfPinContext>
> = {
	context: createRequestSelfPinContext,
	policyAction: POLICY_ACTION_CATALOG.identity.updateOwnPreferences,
	mutation: true,
	input: z.object({ groupName }),

	fn: (ctx, input) => unpinGroup(ctx, input.groupName)
};

export const DELETE = handle(_deleteConfig);
