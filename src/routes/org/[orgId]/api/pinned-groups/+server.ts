import { z } from 'zod';
import { pinGroup, unpinGroup } from '$features/personnel/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { createRequestSelfPinContext } from '$lib/server/adapters/requestContexts.server';

const groupId = z.string('Choose a Group').min(1, 'Choose a Group');

const postInput = z.object({ groupId, sortOrder: z.number().int().nonnegative().optional() });

export const _postConfig: RouteConfig<
	z.infer<typeof postInput>,
	unknown,
	ReturnType<typeof createRequestSelfPinContext>
> = {
	context: createRequestSelfPinContext,
	policyAction: POLICY_ACTION_CATALOG.identity.updateOwnPreferences,
	mutation: true,
	input: postInput,

	fn: (ctx, input) => pinGroup(ctx, { groupId: input.groupId, sortOrder: input.sortOrder ?? 0 })
};

export const POST = handle(_postConfig);

export const _deleteConfig: RouteConfig<
	{ groupId: string },
	unknown,
	ReturnType<typeof createRequestSelfPinContext>
> = {
	context: createRequestSelfPinContext,
	policyAction: POLICY_ACTION_CATALOG.identity.updateOwnPreferences,
	mutation: true,
	input: z.object({ groupId }),

	fn: (ctx, input) => unpinGroup(ctx, input.groupId)
};

export const DELETE = handle(_deleteConfig);
