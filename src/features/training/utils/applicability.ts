import type { TrainingType } from '$features/training/training.types';
import type { Personnel } from '$lib/types';

export function isTrainingApplicable(type: TrainingType, person: Personnel): boolean {
	const isExcluded =
		type.excludedRoles.includes(person.clinicRole) ||
		type.excludedMos.includes(person.mos) ||
		type.excludedRanks.includes(person.rank);

	if (isExcluded) return false;

	const hasAppliesTo = type.appliesToRoles.length > 0 || type.appliesToMos.length > 0 || type.appliesToRanks.length > 0;

	if (!hasAppliesTo) return true;

	return (
		type.appliesToRoles.includes(person.clinicRole) ||
		type.appliesToMos.includes(person.mos) ||
		type.appliesToRanks.includes(person.rank)
	);
}
