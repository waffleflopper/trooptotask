import {
	BUILT_IN_RANK_CATALOG,
	type GroupTree,
	type Personnel,
	type RankCatalogEntry
} from '$features/personnel/contracts';

export type SignInRosterFilter = {
	/** Canonical: a Group covers its sub-groups, so none is listed with its ancestor. */
	groups: string[];
	ranks: string[];
	mos: string[];
	roles: string[];
};

export type SignInRosterFilterPerson = Pick<Personnel, 'groupId' | 'rank'> & {
	mos: Personnel['mos'] | null;
	clinicRole: Personnel['clinicRole'] | null;
};

type FilterOptionPerson = Pick<Personnel, 'archivedAt'> & Pick<SignInRosterFilterPerson, 'mos' | 'clinicRole'>;

export type SignInRosterRankQuickFilterCategory = Extract<
	RankCatalogEntry['category'],
	'officer' | 'warrant' | 'enlisted' | 'civilian'
>;

export function emptySignInRosterFilter(): SignInRosterFilter {
	return { groups: [], ranks: [], mos: [], roles: [] };
}

type GroupContains = Pick<GroupTree, 'contains'>;

export function matchesSignInRosterFilter(
	person: SignInRosterFilterPerson,
	filter: SignInRosterFilter,
	tree: GroupContains
): boolean {
	return (
		(filter.groups.length === 0 || filter.groups.some((groupId) => tree.contains(groupId, person.groupId))) &&
		matchesDimension(person.rank.trim(), filter.ranks) &&
		matchesDimension(person.mos, filter.mos) &&
		matchesDimension(person.clinicRole, filter.roles)
	);
}

function matchesDimension(value: string | null, selected: readonly string[]): boolean {
	return selected.length === 0 || (value !== null && selected.includes(value));
}

export function filterSignInRosterPersonnel<T extends SignInRosterFilterPerson>(
	personnel: readonly T[],
	filter: SignInRosterFilter,
	tree: GroupContains
): T[] {
	return personnel.filter((person) => matchesSignInRosterFilter(person, filter, tree));
}

export function signInRosterFilterOptions(personnel: readonly FilterOptionPerson[]): {
	mos: string[];
	roles: string[];
} {
	const mos = new Set<string>();
	const roles = new Set<string>();
	for (const person of personnel) {
		if (person.archivedAt) continue;
		if (person.mos?.trim()) mos.add(person.mos);
		if (person.clinicRole?.trim()) roles.add(person.clinicRole);
	}
	return { mos: [...mos].sort(), roles: [...roles].sort() };
}

export function signInRosterRankCategoryGroups(
	rankCatalog: readonly RankCatalogEntry[] | undefined,
	ranks: readonly string[]
): Record<SignInRosterRankQuickFilterCategory, string[]> {
	const catalog = rankCatalog && rankCatalog.length > 0 ? rankCatalog : BUILT_IN_RANK_CATALOG;
	const categoriesByCode = new Map<string, SignInRosterRankQuickFilterCategory>();
	const categoriesByNormalizedCode = new Map<string, SignInRosterRankQuickFilterCategory | null>();
	for (const entry of catalog) {
		if (!isQuickFilterCategory(entry.category)) continue;
		categoriesByCode.set(entry.code, entry.category);
		const normalizedCode = entry.code.toUpperCase();
		const existingCategory = categoriesByNormalizedCode.get(normalizedCode);
		if (existingCategory === undefined) {
			categoriesByNormalizedCode.set(normalizedCode, entry.category);
		} else if (existingCategory !== entry.category) {
			categoriesByNormalizedCode.set(normalizedCode, null);
		}
	}

	const groups: Record<SignInRosterRankQuickFilterCategory, string[]> = {
		officer: [],
		warrant: [],
		enlisted: [],
		civilian: []
	};
	for (const rank of ranks) {
		const category = categoriesByCode.get(rank) ?? categoriesByNormalizedCode.get(rank.toUpperCase());
		if (category) groups[category].push(rank);
	}
	return groups;
}

function isQuickFilterCategory(
	category: RankCatalogEntry['category']
): category is SignInRosterRankQuickFilterCategory {
	return category === 'officer' || category === 'warrant' || category === 'enlisted' || category === 'civilian';
}
