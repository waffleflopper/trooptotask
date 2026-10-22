import { compareRankCodes } from '$features/personnel/contracts';
import type { DutyPickerOption } from './dutyPickerOptions';

export type DutyFilterFacet = 'rank' | 'role' | 'mos';

/** Selected values per facet. An empty list leaves that facet unconstrained. */
export type DutyPickerFilter = Readonly<Record<DutyFilterFacet, readonly string[]>>;

export const EMPTY_DUTY_FILTER: DutyPickerFilter = { rank: [], role: [], mos: [] };

/** The facet registry drives the UI: one dropdown per entry, in this order. */
export const DUTY_FILTER_FACETS: readonly { key: DutyFilterFacet; label: string }[] = [
	{ key: 'rank', label: 'Rank' },
	{ key: 'role', label: 'Role' },
	{ key: 'mos', label: 'MOS' }
];

type PersonnelOption = Extract<DutyPickerOption, { kind: 'personnel' }>;

function facetValue(option: PersonnelOption, facet: DutyFilterFacet): string {
	return (facet === 'rank' ? option.prefix : facet === 'role' ? option.role : option.mos).trim();
}

/** Distinct non-blank values present among personnel options: Rank highest first, Role and MOS alphabetical. */
export function dutyFilterValues(options: readonly DutyPickerOption[], facet: DutyFilterFacet): string[] {
	const values = new Set<string>();
	for (const option of options) {
		if (option.kind !== 'personnel') continue;
		const value = facetValue(option, facet);
		if (value) values.add(value);
	}
	return [...values].sort(facet === 'rank' ? compareRankCodes : (a, b) => a.localeCompare(b, 'en-US'));
}

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

/**
 * Groups and the current assignee always pass.
 * Selected values absent from the options are ignored, so a stale stored selection never empties the list invisibly.
 */
export function applyDutyFilter(options: readonly DutyPickerOption[], filter: DutyPickerFilter): DutyPickerOption[] {
	const selection: Record<DutyFilterFacet, string[]> = { rank: [], role: [], mos: [] };
	for (const { key } of DUTY_FILTER_FACETS) {
		const present = new Set(dutyFilterValues(options, key));
		selection[key] = filter[key].filter((value) => present.has(value));
	}
	if (DUTY_FILTER_FACETS.every(({ key }) => !selection[key].length)) return [...options];
	return options.filter(
		(option) =>
			option.kind !== 'personnel' ||
			option.current ||
			matchesFacets(
				{ rank: facetValue(option, 'rank'), role: facetValue(option, 'role'), mos: facetValue(option, 'mos') },
				selection
			)
	);
}
