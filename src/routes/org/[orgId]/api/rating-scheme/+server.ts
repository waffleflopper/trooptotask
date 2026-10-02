import { json } from '@sveltejs/kit';
import { handle } from '$lib/server/adapters/httpAdapter';
import { fail } from '$lib/errors';
import { validateUUID } from '$lib/server/validation';
import {
	createRatingSchemeEntry,
	updateRatingSchemeEntry,
	removeRatingSchemeEntry,
	ratingSchemeEntryCreateSchema,
	ratingSchemeEntryUpdateSchema
} from '$features/rating-scheme/index.server';
import type { RouteConfig } from '$lib/server/adapters/httpAdapter';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';

export const _postConfig: RouteConfig<Record<string, unknown>, unknown> = {
	mutation: true,
	input: ratingSchemeEntryCreateSchema,
	policyAction: POLICY_ACTION_CATALOG.ratingScheme.updateEntries,
	policyResource: { kind: 'unscoped' },
	fn: (ctx, input) => createRatingSchemeEntry(ctx, input)
};

export const _putConfig: RouteConfig<Record<string, unknown>, unknown> = {
	mutation: true,
	input: ratingSchemeEntryUpdateSchema,
	policyAction: POLICY_ACTION_CATALOG.ratingScheme.updateEntries,
	policyResource: { kind: 'unscoped' },
	fn: (ctx, input) => updateRatingSchemeEntry(ctx, input)
};

export const _deleteConfig: RouteConfig<Record<string, unknown>, Record<string, unknown>> = {
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.ratingScheme.requestEntryDeletion,
	policyResource: { kind: 'unscoped' },
	fn: async (ctx, input) => {
		const id = input?.id;
		if (!id || typeof id !== 'string') fail(400, 'Missing id');
		if (!validateUUID(id)) fail(400, 'Invalid resource ID');

		const result = await removeRatingSchemeEntry(
			{
				...ctx,
				notifyRatingSchemeEntryDeleted: () =>
					ctx.notifications.notifyAdmins(ctx.auth.orgId, ctx.auth.userId, {
						type: 'config_type_deleted',
						title: 'Rating Scheme Entry Deleted',
						message: 'A rating scheme entry was deleted.'
					})
			},
			id
		);
		if (result?.requiresApproval) {
			return { requiresApproval: true };
		}
		return { success: true };
	},
	formatOutput: (result) => {
		if (result.requiresApproval) {
			return json(result, { status: 202 });
		}
		return json(result);
	}
};

export const POST = handle(_postConfig);
export const PUT = handle(_putConfig);
export const DELETE = handle(_deleteConfig);
