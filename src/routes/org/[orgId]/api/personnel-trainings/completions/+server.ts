import type { RequestEvent } from '@sveltejs/kit';
import { createRequestTrainingCompletionContext } from '$lib/server/adapters/featureRequestContexts.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { handle, readFormData, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { recordTrainingCompletion } from '$features/training/index.server';
import type { SavedTrainingCompletion } from '$features/training/contracts';

const TEXT_FIELDS = ['personnelId', 'trainingTypeId', 'completionDate', 'expirationDate', 'notes'] as const;

async function parseCompletionForm(event: RequestEvent) {
	const form = await readFormData(event);
	const input: Record<string, unknown> & { certificate?: File } = {};
	for (const name of TEXT_FIELDS) {
		const value = form.get(name);
		if (typeof value === 'string' && value !== '') input[name] = value;
	}
	const certificate = form.get('certificate');
	if (certificate instanceof File && certificate.size > 0) input.certificate = certificate;
	return input;
}

export const _postConfig = {
	context: createRequestTrainingCompletionContext,
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.training.recordCompletions,
	policyResource: { kind: 'unscoped' },
	parseInput: parseCompletionForm,
	fn: async (ctx, input) => ({ record: await recordTrainingCompletion(ctx, input) })
} satisfies RouteConfig<
	Awaited<ReturnType<typeof parseCompletionForm>>,
	{ record: SavedTrainingCompletion },
	Parameters<typeof recordTrainingCompletion>[0]
>;

export const POST = handle(_postConfig);
