import { compareRankCodes, type RankCatalogEntry } from '$lib/domain/rankCatalog';
import { rankCodesForOptions } from '$lib/domain/rankOptions';

export interface SignInRosterRankSortRow {
	rank: string;
	lastName: string;
	firstName: string;
}

export function compareSignInRosterRowsByRank(
	a: SignInRosterRankSortRow,
	b: SignInRosterRankSortRow,
	rankCatalog?: readonly RankCatalogEntry[]
): number {
	const rankDiff = compareRankCodes(
		a.rank,
		b.rank,
		rankCatalog && rankCatalog.length > 0 ? { catalog: rankCatalog } : undefined
	);
	if (rankDiff !== 0) return rankDiff;

	const lastDiff = a.lastName.localeCompare(b.lastName);
	if (lastDiff !== 0) return lastDiff;
	return a.firstName.localeCompare(b.firstName);
}

export function sortSignInRosterRows<T extends SignInRosterRankSortRow>(
	rows: T[],
	sortBy: 'alphabetical' | 'rank',
	rankCatalog?: readonly RankCatalogEntry[]
): T[] {
	return [...rows].sort((a, b) => {
		if (sortBy === 'rank') {
			return compareSignInRosterRowsByRank(a, b, rankCatalog);
		}

		const lastDiff = a.lastName.localeCompare(b.lastName);
		if (lastDiff !== 0) return lastDiff;
		return a.firstName.localeCompare(b.firstName);
	});
}

export function signInRosterRankOptions(
	rankCatalog: readonly RankCatalogEntry[] | undefined,
	observedRanks: readonly string[],
	fallbackRanks: readonly string[] = []
): string[] {
	return rankCodesForOptions({ rankCatalog, observedRanks, fallbackRanks });
}
