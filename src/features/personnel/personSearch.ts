import type { Personnel } from './personnel.types';

/** What the Cmd/Ctrl+K palette needs to find a Person and open their record. */
export interface PersonSearchEntry {
	id: string;
	slug: string;
	rank: string;
	firstName: string;
	lastName: string;
	groupName: string | null;
}

export function toPersonSearchEntry(person: Personnel): PersonSearchEntry {
	return {
		id: person.id,
		slug: person.slug ?? person.id,
		rank: person.rank,
		firstName: person.firstName,
		lastName: person.lastName,
		groupName: person.groupName || null
	};
}

/** Lower-cases and turns every run of punctuation or spaces into one space, so "Smith, John" and "smith john" agree. */
function searchWords(value: string | null | undefined): string {
	return (value ?? '')
		.toLowerCase()
		.replace(/[^\p{L}\p{N}]+/gu, ' ')
		.trim();
}

/**
 * Whether every word of the query appears inside at least one field. Word order, case and punctuation do not matter,
 * so "SGT Smith", "Smith SGT" and "smith, sgt" find the same Person. An empty query matches everyone.
 */
export function matchesSearchTokens(fields: ReadonlyArray<string | null | undefined>, query: string): boolean {
	const tokens = searchWords(query).split(' ').filter(Boolean);
	if (tokens.length === 0) return true;
	const haystack = fields.map(searchWords);
	return tokens.every((token) => haystack.some((field) => field.includes(token)));
}

export function matchesPersonSearch(entry: PersonSearchEntry, query: string): boolean {
	return matchesSearchTokens([entry.rank, entry.firstName, entry.lastName, entry.groupName], query);
}
