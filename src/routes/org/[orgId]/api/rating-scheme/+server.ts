import {
	createRequestRatingSchemeWriteContext,
	createRequestRatingSchemeWorkspaceContext
} from '$lib/server/adapters/featureRequestContexts.server';
import { handle, privateJson } from '$lib/server/adapters/httpAdapter';
import { fail } from '$lib/errors';
import {
	loadRatingSchemeEntryEditor,
	createRatingScheme,
	updateRatingScheme,
	ratingSchemeCreateSchema,
	ratingSchemeUpdateSchema
} from '$features/rating-scheme/index.server';
import type { RouteConfig } from '$lib/server/adapters/httpAdapter';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import type { RatingSchemeEntryEditorData } from '$features/rating-scheme/contracts';
import { uuidSchema } from '$lib/utils/inputSchemas';
import { z } from 'zod';

const entryEditorInput = z.object({ evaluation: uuidSchema });

export const _getConfig: RouteConfig<
	z.infer<typeof entryEditorInput>,
	RatingSchemeEntryEditorData,
	ReturnType<typeof createRequestRatingSchemeWorkspaceContext>
> = {
	context: createRequestRatingSchemeWorkspaceContext,
	policyAction: POLICY_ACTION_CATALOG.ratingScheme.viewEntries,
	policyResource: { kind: 'unscoped' },
	input: entryEditorInput,
	parseInput: (event) => ({ evaluation: event.url.searchParams.get('evaluation') ?? '' }),
	fn: async (ctx, input) =>
		(await loadRatingSchemeEntryEditor(ctx, input.evaluation)) ?? fail(404, 'Evaluation not found'),
	formatOutput: privateJson
};

export const _postConfig: RouteConfig<
	Record<string, unknown>,
	unknown,
	ReturnType<typeof createRequestRatingSchemeWriteContext>
> = {
	context: createRequestRatingSchemeWriteContext,
	mutation: true,
	input: ratingSchemeCreateSchema,
	policyAction: POLICY_ACTION_CATALOG.ratingScheme.updateEntries,
	policyResource: { kind: 'unscoped' },
	fn: (ctx, input) => createRatingScheme(ctx, input)
};

export const _putConfig: RouteConfig<
	Record<string, unknown>,
	unknown,
	ReturnType<typeof createRequestRatingSchemeWriteContext>
> = {
	context: createRequestRatingSchemeWriteContext,
	mutation: true,
	input: ratingSchemeUpdateSchema,
	policyAction: POLICY_ACTION_CATALOG.ratingScheme.updateEntries,
	policyResource: { kind: 'unscoped' },
	fn: (ctx, input) => updateRatingScheme(ctx, input)
};

export const GET = handle(_getConfig);
export const POST = handle(_postConfig);
export const PUT = handle(_putConfig);
