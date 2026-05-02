import { TrainingViewEntity } from '$lib/server/entities/trainingView';
import { entityHandlers } from '$lib/server/adapters/httpAdapter';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';

export const { POST, PUT, DELETE } = entityHandlers(TrainingViewEntity, {
	policyAction: POLICY_ACTION_CATALOG.training.configureRequirements
});
