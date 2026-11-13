import type { PersonnelLookup } from '$features/personnel/contracts';
import type { EvaluatorChain } from '../rating-scheme.types';

type SearchableChain = EvaluatorChain & { ratedPersonId: string };

/** Matches a typed query against the Rated Soldier and every evaluator, by rank and name in any order the unit writes it. */
export function createChainSearch(query: string, personnel: readonly PersonnelLookup[]) {
	const needle = query.trim().toLowerCase();
	if (!needle) return () => true;
	const matches = new Map<string, boolean>(
		personnel.map((person) => [
			person.id,
			[
				`${person.rank} ${person.firstName} ${person.lastName}`,
				`${person.rank} ${person.lastName}`,
				`${person.rank} ${person.lastName}, ${person.firstName}`,
				`${person.lastName}, ${person.firstName}`
			].some((label) => label.toLowerCase().includes(needle))
		])
	);
	const matchesPerson = (id: string | null, externalName: string | null = null): boolean =>
		id ? (matches.get(id) ?? false) : !!externalName?.toLowerCase().includes(needle);
	return (chain: SearchableChain): boolean =>
		matchesPerson(chain.ratedPersonId) ||
		matchesPerson(chain.raterPersonId, chain.raterName) ||
		matchesPerson(chain.seniorRaterPersonId, chain.seniorRaterName) ||
		matchesPerson(chain.intermediateRaterPersonId, chain.intermediateRaterName) ||
		matchesPerson(chain.reviewerPersonId, chain.reviewerName);
}
