import { createRequestTrainingRosterContext } from '$lib/server/adapters/featureRequestContexts.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { handle, privateJson } from '$lib/server/adapters/httpAdapter';
import { readTrainingTypeEditor } from '$features/training/index.server';

export const _getConfig = {
	context: createRequestTrainingRosterContext,
	policyAction: POLICY_ACTION_CATALOG.training.configureRequirements,
	policyResource: { kind: 'organization' as const },
	fn: readTrainingTypeEditor,
	formatOutput: privateJson
};

export const GET = handle(_getConfig);
