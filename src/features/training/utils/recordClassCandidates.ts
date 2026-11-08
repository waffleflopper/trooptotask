import type { Personnel } from '$features/personnel/contracts';
import type { TrainingCompletionFacts, TrainingRequirementFacts, TrainingStatus } from '../training.types';
import { getTrainingStatus } from './trainingStatus';

/** A Person the Record class dialog lists, with the status shown beside them. */
export interface RecordClassCandidate {
	person: Personnel;
	/** The Person's standing on the type, e.g. "12d left"; null where the caller has none to show. */
	statusLabel: string | null;
	checked: boolean;
}

/** Narrows the list to a Group; absent where the caller already chose its people. */
export interface RecordClassGroupFilter {
	options: readonly { value: string; label: string }[];
	/** The option selected when the dialog opens; '' lists everyone. */
	initial: string;
	/** Everyone in the Group, including its sub-Groups. */
	personnelIdsIn: (groupId: string) => ReadonlySet<string>;
}

/**
 * Whether a status is listed in a class, and checked: the Soldiers the class helps are checked, a current Soldier is
 * listed unchecked for an early retrain. A status left out (exempt, not required) is not listed.
 */
const CLASS_LISTING: Partial<Record<TrainingStatus, { checked: boolean }>> = {
	expired: { checked: true },
	'warning-orange': { checked: true },
	'warning-yellow': { checked: true },
	'not-completed': { checked: true },
	current: { checked: false }
};

export function recordClassCandidates(
	type: TrainingRequirementFacts,
	personnel: readonly Personnel[],
	trainings: readonly TrainingCompletionFacts[],
	asOf: string
): RecordClassCandidate[] {
	const records = new Map(
		trainings.filter((record) => record.trainingTypeId === type.id).map((record) => [record.personnelId, record])
	);
	return personnel.flatMap((person) => {
		const status = getTrainingStatus(records.get(person.id), type, person, asOf);
		const listing = CLASS_LISTING[status.status];
		return listing ? [{ person, statusLabel: status.label, checked: listing.checked }] : [];
	});
}
