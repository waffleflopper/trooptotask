/** OR within a facet, AND across facets, ignoring case and surrounding space. An empty selection leaves its facet unconstrained. */
export function matchesFacets<F extends string>(
	values: Readonly<Record<F, string>>,
	selection: Readonly<Record<F, readonly string[]>>
): boolean {
	return (Object.keys(selection) as F[]).every((facet) => {
		const selected = selection[facet];
		if (!selected.length) return true;
		const value = normalizeFacetValue(values[facet]);
		return selected.some((candidate) => normalizeFacetValue(candidate) === value);
	});
}

function normalizeFacetValue(value: string): string {
	return value.trim().toLowerCase();
}
