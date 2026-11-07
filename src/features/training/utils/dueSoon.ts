import type { Personnel } from '$features/personnel/contracts';
import type { TrainingCompletionFacts, TrainingType } from '../training.types';
import { getDelinquentTrainings, type DelinquentTraining, type TrainingStatusInfo } from './trainingStatus';

export interface TrainingDueSoonPerson {
	personnelId: string;
	/** Whole days until the record expires; 0 means it expires on `asOf`. */
	daysLeft: number;
	/** The warning window the record is in, as the status computed it. */
	status: 'warning-orange' | 'warning-yellow';
}

/** The People inside one training type's warning window, soonest first. */
export interface TrainingDueSoon {
	trainingTypeId: string;
	people: readonly TrainingDueSoonPerson[];
}

type DueSoonSource = Pick<DelinquentTraining, 'person' | 'type'> & { statusInfo: TrainingStatusInfo };

/**
 * Groups the warning-window entries by type. Missing and expired entries are left out: they have their own lists.
 * People keep the input order among equal days; types rank by their soonest Person, then by name.
 */
export function groupDueSoon(entries: Iterable<DueSoonSource>): TrainingDueSoon[] {
	const byType = new Map<string, { name: string; people: TrainingDueSoonPerson[] }>();
	for (const { person, type, statusInfo } of entries) {
		const { status, daysUntilExpiration: daysLeft } = statusInfo;
		if ((status !== 'warning-orange' && status !== 'warning-yellow') || daysLeft === null) continue;
		const group = byType.get(type.id) ?? { name: type.name, people: [] };
		group.people.push({ personnelId: person.id, daysLeft, status });
		byType.set(type.id, group);
	}
	return [...byType]
		.map(([trainingTypeId, { name, people }]) => ({
			trainingTypeId,
			name,
			people: people.sort((a, b) => a.daysLeft - b.daysLeft)
		}))
		.sort((a, b) => a.people[0].daysLeft - b.people[0].daysLeft || a.name.localeCompare(b.name))
		.map(({ trainingTypeId, people }) => ({ trainingTypeId, people }));
}

export function dueSoonByType(
	personnel: Personnel[],
	types: TrainingType[],
	trainings: TrainingCompletionFacts[],
	asOf: string
): TrainingDueSoon[] {
	return groupDueSoon(getDelinquentTrainings(personnel, types, trainings, { asOf, includeNotCompleted: false }));
}
