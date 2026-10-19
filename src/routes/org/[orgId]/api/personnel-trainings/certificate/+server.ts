import type { RequestEvent } from '@sveltejs/kit';
import { createRequestTrainingCompletionContext } from '$lib/server/adapters/featureRequestContexts.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { openTrainingCertificate } from '$features/training/index.server';

export const _getConfig = {
	context: createRequestTrainingCompletionContext,
	policyAction: POLICY_ACTION_CATALOG.training.viewRecords,
	policyResource: { kind: 'unscoped' },
	parseInput: (event: RequestEvent) => ({
		kind: event.url.searchParams.get('kind'),
		id: event.url.searchParams.get('id')
	}),
	fn: (ctx, input) => openTrainingCertificate(ctx, input),
	formatOutput: (url) => new Response(null, { status: 303, headers: { location: url, 'cache-control': 'no-store' } })
} satisfies RouteConfig<Record<string, unknown>, string, Parameters<typeof openTrainingCertificate>[0]>;

export const GET = handle(_getConfig);
