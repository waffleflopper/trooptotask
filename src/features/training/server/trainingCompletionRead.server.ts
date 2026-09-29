import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { requireFeaturePolicy } from '$lib/access/index.server';
import type { PersonnelTraining } from '../contracts';
import { PersonnelTrainingEntity } from './personnelTrainingEntity.server';
import type { TrainingCompletionReadContext } from './trainingCompletionPorts.server';

/** The request store retains its Organization/Group row authorization. */
export async function listTrainingCompletions(ctx: TrainingCompletionReadContext): Promise<PersonnelTraining[]> {
	await requireFeaturePolicy(ctx, POLICY_ACTION_CATALOG.training.viewRecords, { kind: 'unscoped' }, 'training_record');
	const rows = await ctx.store.findMany<Record<string, unknown>>(
		PersonnelTrainingEntity.table,
		ctx.auth.orgId,
		undefined,
		{
			select: PersonnelTrainingEntity.select
		}
	);
	return PersonnelTrainingEntity.fromDbArray(rows);
}
