/**
 * Training reports query — fetches all personnel training records for report generation.
 *
 * Returns the raw `PersonnelTraining` rows without aggregation. The training reports feature
 * uses these to compute per-type and per-personnel completion metrics client-side.
 *
 * Unlike `trainingSummaryQuery.ts` (which pre-aggregates), this gives the full dataset so
 * the reports UI can filter and group dynamically.
 */
import type { QueryPorts } from '$lib/server/core/ports';
import type { PersonnelTraining } from '$features/training/training.types';
import { PersonnelTrainingEntity } from '$lib/server/entities/personnelTraining';

export interface TrainingReportsData {
	trainings: PersonnelTraining[];
}

export async function fetchTrainingReportsData(ctx: QueryPorts): Promise<TrainingReportsData> {
	const rows = await ctx.store.findMany<Record<string, unknown>>('personnel_trainings', ctx.auth.orgId);
	const trainings = PersonnelTrainingEntity.fromDbArray(rows);
	return { trainings };
}
