import type { RosterSignalSlices, RosterSourceQuery, RosterSourceRead } from '$features/personnel/contracts';
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

export function createSupabaseTrainingRosterSignals(slices: RosterSignalSlices) {
	return async (
		query: RosterSourceQuery
	): Promise<RosterSourceRead<PersonnelTrainingReadiness<TrainingCompletionFacts>>> => {
		const read = (await slices('training', query)) as {
			cohort: CohortTuple[];
			types: TypeRow[];
			completions: CompletionTuple[];
		};
		const { asOf } = query;
		const types = read.types.map(toRequirementFacts);
		const completions = new Map<string, TrainingCompletionFacts[]>();
		for (const [personnelId, trainingTypeId, completionDate, expirationDate] of read.completions) {
			const facts = { trainingTypeId, completionDate, expirationDate };
			const own = completions.get(personnelId);
			if (own) own.push(facts);
			else completions.set(personnelId, [facts]);
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
