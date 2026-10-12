import { buildDefaultRankCatalogSeeds } from './rankCatalogOperations.server';

/** Rows a new Organization starts with, written by Organization's creation transaction. */
export function getPersonnelOrganizationDefaults() {
	return {
		groups: [
			{ name: 'Leadership', sort_order: 0 },
			{ name: 'Alpha', sort_order: 1 },
			{ name: 'Bravo', sort_order: 2 }
		],
		rank_catalog: buildDefaultRankCatalogSeeds().map((entry) => ({
			code: entry.code,
			label: entry.label,
			service: entry.service,
			category: entry.category,
			pay_grade: entry.pay_grade,
			state: entry.state,
			source: entry.source,
			sort_order: entry.sort_order
		}))
	};
}
