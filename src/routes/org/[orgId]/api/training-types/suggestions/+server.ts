import { trainingSuggestionsInputSchema } from '$features/training/contracts';
import { applyTrainingSuggestions } from '$features/training/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { handle } from '$lib/server/adapters/httpAdapter';
import { createRequestTrainingCatalogContext } from '$lib/server/adapters/featureRequestContexts.server';

export const _postConfig = {
	context: createRequestTrainingCatalogContext,
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.training.configureRequirements,
	policyResource: { kind: 'organization' as const },
	input: trainingSuggestionsInputSchema,
	fn: applyTrainingSuggestions
};

export const POST = handle(_postConfig);
