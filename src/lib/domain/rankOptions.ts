import { BUILT_IN_RANK_CATALOG, compareRankCodes, type RankCatalogEntry } from './rankCatalog';

function catalogWithBuiltInFallback(rankCatalog?: readonly RankCatalogEntry[]): readonly RankCatalogEntry[] {
	if (!rankCatalog) return BUILT_IN_RANK_CATALOG;

	const configuredCodes = new Set(rankCatalog.map((entry) => entry.code));
	return [...rankCatalog, ...BUILT_IN_RANK_CATALOG.filter((entry) => !configuredCodes.has(entry.code))];
}

export function rankCodesForOptions(input: {
	rankCatalog?: readonly RankCatalogEntry[];
	observedRanks?: readonly string[];
	preserveRanks?: readonly string[];
	fallbackRanks?: readonly string[];
}): string[] {
	const { rankCatalog, observedRanks = [], preserveRanks = [], fallbackRanks = [] } = input;
	const options: string[] = [];
	const seen = new Set<string>();

	function add(rank: string): void {
		const value = rank.trim();
		if (value && !seen.has(value)) {
			options.push(value);
			seen.add(value);
		}
	}

	if (rankCatalog) {
		for (const entry of rankCatalog
			.filter((entry) => entry.state === 'active')
			.toSorted((left, right) => compareRankCodes(left.code, right.code, { catalog: rankCatalog }))) {
			add(entry.code);
		}
	} else {
		for (const rank of fallbackRanks) add(rank);
	}

	for (const rank of observedRanks
		.map((value) => value.trim())
		.filter(Boolean)
		.toSorted((left, right) => compareRankCodes(left, right, { catalog: rankCatalog }))) {
		add(rank);
	}
	for (const rank of preserveRanks) add(rank);

	return options;
}

export function observedRankCodesForOptions(input: {
	rankCatalog?: readonly RankCatalogEntry[];
	observedRanks: readonly string[];
}): string[] {
	const catalog = catalogWithBuiltInFallback(input.rankCatalog);
	const seen = new Set<string>();

	return input.observedRanks
		.map((rank) => rank.trim())
		.filter((rank) => {
			if (!rank || seen.has(rank)) return false;
			seen.add(rank);
			return true;
		})
		.toSorted((left, right) => compareRankCodes(left, right, { catalog }));
}
