import type { TrainingType } from '$features/training/training.types';
import type { PersonnelRequirementPerson } from '$features/personnel/contracts';

export function isTrainingApplicable(type: TrainingType, person: PersonnelRequirementPerson): boolean {
	if (type.isOptional) return false;

	const rank = person.rank.trim();
	const isExcluded =
		type.excludedRoles.includes(person.clinicRole) ||
		type.excludedMos.includes(person.mos) ||
		type.excludedRanks.includes(rank);

	if (isExcluded) return false;

	const hasAppliesTo = type.appliesToRoles.length > 0 || type.appliesToMos.length > 0 || type.appliesToRanks.length > 0;

	if (!hasAppliesTo) return true;

	return (
		type.appliesToRoles.includes(person.clinicRole) ||
		type.appliesToMos.includes(person.mos) ||
		type.appliesToRanks.includes(rank)
	);
}
