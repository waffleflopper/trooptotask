import type { PersonnelLookup } from '$features/personnel/contracts';
import type { EvaluatorChain } from '../rating-scheme.types';

/** "SSG Luis Ruiz": how a sentence names a Soldier. */
export function spokenPersonLabel(person: Pick<PersonnelLookup, 'rank' | 'firstName' | 'lastName'>): string {
	return `${person.rank} ${person.firstName} ${person.lastName}`;
}

/** The evaluators on a chain in rating order, named as a sentence would; Not Set roles are left out. */
export function chainNames(chain: EvaluatorChain, personnel: readonly PersonnelLookup[]): string[] {
	const named = (personId: string | null, name: string | null): string | null => {
		if (personId) {
			const person = personnel.find((candidate) => candidate.id === personId);
			return person ? spokenPersonLabel(person) : null;
		}
		return name?.trim() || null;
	};
	return [
		named(chain.raterPersonId, chain.raterName),
		named(chain.intermediateRaterPersonId, chain.intermediateRaterName),
		named(chain.seniorRaterPersonId, chain.seniorRaterName),
		named(chain.reviewerPersonId, chain.reviewerName)
	].filter((name): name is string => name !== null);
}

export function joinNames(names: readonly string[]): string {
	if (names.length <= 1) return names[0] ?? '';
	return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}
