import type { Personnel } from '$features/personnel/contracts';

/** Every word of the query must appear in the person's rank, name or MOS, in any order and case. */
export function matchesPersonnelSearch(person: Personnel, query: string): boolean {
	const words = query
		.toLowerCase()
		.split(/[\s,]+/)
		.filter(Boolean);
	if (words.length === 0) return true;
	const haystack = `${person.rank} ${person.lastName} ${person.firstName} ${person.mos}`.toLowerCase();
	return words.every((word) => haystack.includes(word));
}
