import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { requireFeaturePolicy } from '$lib/access/index.server';
import type { PersonnelTraining } from '../contracts';
import type { TrainingCompletionReadContext } from './trainingCompletionPorts.server';

/** The request store retains its Organization/Group row authorization. */
export async function listTrainingCompletions(ctx: TrainingCompletionReadContext): Promise<PersonnelTraining[]> {
	await requireFeaturePolicy(ctx, POLICY_ACTION_CATALOG.training.viewRecords, { kind: 'unscoped' }, 'training_record');
	return ctx.trainingCompletions.listCompletions();
}
