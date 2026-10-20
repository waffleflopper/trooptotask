import { UNIT_COUNT_ROW_SOURCES, type UnitCountKey, type UnitCountRowSource, type UnitCounts } from './unitCounts';

/** Bound to one Organization. Each method is one exact count under the request's own access. */
export interface OrganizationUnitCountsPort {
	countRows(source: UnitCountRowSource): Promise<number>;
	countRatingSchemeEntries(): Promise<number>;
}

function countKey(port: OrganizationUnitCountsPort, key: UnitCountKey): Promise<number> {
	return key === 'ratingSchemeEntries' ? port.countRatingSchemeEntries() : port.countRows(UNIT_COUNT_ROW_SOURCES[key]);
}

/** Runs one count per requested key, in parallel, and nothing else. */
export async function readUnitCounts<K extends UnitCountKey>(
	port: OrganizationUnitCountsPort,
	keys: readonly K[]
): Promise<UnitCounts<K>> {
	const requested: UnitCountKey[] = [...new Set(keys)];
	const totals = await Promise.all(requested.map((key) => countKey(port, key)));
	return Object.fromEntries(requested.map((key, i) => [key, totals[i]])) as UnitCounts<K>;
}
