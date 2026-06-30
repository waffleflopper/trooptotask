import { compareRankCodes, type RankCatalogEntry } from './rankCatalog';

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

	for (const rank of [...observedRanks].toSorted((left, right) =>
		compareRankCodes(left, right, { catalog: rankCatalog })
	)) {
		add(rank);
	}
	for (const rank of preserveRanks) add(rank);

	return options;
}
