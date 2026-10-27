import { buildDefaultRankCatalogSeeds } from './rankCatalogOperations.server';

/** Rows a new Organization starts with, written by Organization's creation transaction. */
export function getPersonnelOrganizationDefaults() {
	return {
		groups: [],
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
