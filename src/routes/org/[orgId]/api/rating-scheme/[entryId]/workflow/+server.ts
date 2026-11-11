import { transitionRatingSchemeEntry } from '$features/rating-scheme/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { handle, readJsonBody, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { createRequestRatingSchemeWriteContext } from '$lib/server/adapters/featureRequestContexts.server';

export const _postConfig = {
	context: createRequestRatingSchemeWriteContext,
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.ratingScheme.updateEntries,
	policyResource: { kind: 'unscoped' },
	parseInput: async (event) => ({ id: event.params.entryId ?? '', body: await readJsonBody(event) }),
	fn: (ctx, { id, body }) => transitionRatingSchemeEntry(ctx, id, body)
} satisfies RouteConfig<
	{ id: string; body: Record<string, unknown> },
	unknown,
	ReturnType<typeof createRequestRatingSchemeWriteContext>
>;

export const POST = handle(_postConfig);
