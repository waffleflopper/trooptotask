import type { SupabaseClient } from '@supabase/supabase-js';
import type { RosterSourceQuery, RosterSourceRead } from '$features/personnel/contracts';
import {
	buildPersonnelTrainingReadiness,
	type PersonnelTrainingReadiness,
	type TrainingCompletionFacts
} from '../utils/personnelTrainingItems';
import type { TrainingRequirementFacts } from '../training.types';

type CohortTuple = [id: string, rank: string, mos: string, clinicRole: string];
type TypeRow = {
	id: string;
	name: string;
	expiration_months: number | null;
	warning_days_yellow: number;
	warning_days_orange: number;
	applies_to_roles: string[] | null;
	applies_to_mos: string[] | null;
	applies_to_ranks: string[] | null;
	excluded_roles: string[] | null;
	excluded_mos: string[] | null;
	excluded_ranks: string[] | null;
	expiration_date_only: boolean | null;
	can_be_exempted: boolean | null;
	exempt_personnel_ids: string[] | null;
	is_optional: boolean | null;
};
type CompletionTuple = [
	personnelId: string,
	trainingTypeId: string,
	completionDate: string | null,
	expirationDate: string | null
];

function toRequirementFacts(row: TypeRow): TrainingRequirementFacts {
	return {
		id: row.id,
		name: row.name,
		expirationMonths: row.expiration_months,
		warningDaysYellow: row.warning_days_yellow,
		warningDaysOrange: row.warning_days_orange,
		appliesToRoles: row.applies_to_roles ?? [],
		appliesToMos: row.applies_to_mos ?? [],
		appliesToRanks: row.applies_to_ranks ?? [],
		excludedRoles: row.excluded_roles ?? [],
		excludedMos: row.excluded_mos ?? [],
		excludedRanks: row.excluded_ranks ?? [],
		expirationDateOnly: row.expiration_date_only ?? false,
		canBeExempted: row.can_be_exempted ?? false,
		exemptPersonnelIds: row.exempt_personnel_ids ?? [],
		isOptional: row.is_optional ?? false
	};
}

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
		const read = data as { cohort: CohortTuple[]; types: TypeRow[]; completions: CompletionTuple[] };
		const types = read.types.map(toRequirementFacts);
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
