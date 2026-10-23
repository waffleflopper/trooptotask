import type { SupabaseClient } from '@supabase/supabase-js';
import type { RosterSourceQuery, RosterSourceRead } from '$features/personnel/contracts';
import {
	buildPersonnelTrainingReadiness,
	type PersonnelTrainingReadiness,
	type TrainingCompletionFacts
} from '../utils/personnelTrainingItems';
import { toTrainingType, type TrainingTypeRow } from './trainingPersistenceMapping.server';

type CohortTuple = [id: string, rank: string, mos: string, clinicRole: string];
type CompletionTuple = [
	personnelId: string,
	trainingTypeId: string,
	completionDate: string | null,
	expirationDate: string | null
];

/** Each visible active Person's required training, read for the whole roster in one statement. */
export function createSupabaseTrainingRosterSignals(client: SupabaseClient, orgId: string) {
	return async ({
		asOf,
		personnelIds
	}: RosterSourceQuery): Promise<RosterSourceRead<PersonnelTrainingReadiness<TrainingCompletionFacts>>> => {
		const { data, error } = await client.rpc('roster_signal_training', {
			p_organization_id: orgId,
			p_personnel_ids: personnelIds
		});
		if (error) throw new Error(error.message);
		const read = data as { cohort: CohortTuple[]; types: TrainingTypeRow[]; completions: CompletionTuple[] };
		const types = read.types.map(toTrainingType);
		const completions = new Map<string, TrainingCompletionFacts[]>();
		for (const [personnelId, trainingTypeId, completionDate, expirationDate] of read.completions) {
			completions.set(personnelId, [
				...(completions.get(personnelId) ?? []),
				{ trainingTypeId, completionDate, expirationDate }
			]);
		}
		return new Map(
			read.cohort.map(([id, rank, mos, clinicRole]) => [
				id,
				buildPersonnelTrainingReadiness({
					person: { id, rank, mos, clinicRole },
					types,
					completions: completions.get(id) ?? [],
					history: [],
					asOf
				})
			])
		);
	};
}
