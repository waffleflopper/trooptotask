import type { UseCaseContext } from '$lib/server/core/ports';
import type { PersonnelTraining } from '$features/training/training.types';
import { PersonnelTrainingEntity } from '$lib/server/entities/personnelTraining';

export interface TrainingReportsData {
	trainings: PersonnelTraining[];
}

export async function fetchTrainingReportsData(ctx: UseCaseContext): Promise<TrainingReportsData> {
	const rows = await ctx.store.findMany<Record<string, unknown>>('personnel_trainings', ctx.auth.orgId);
	const trainings = PersonnelTrainingEntity.fromDbArray(rows);
	return { trainings };
}
