interface RankedEntry {
	id: string;
	personnelId: string;
	statusTypeId: string;
	startDate: string;
}
interface RankedStatusType {
	id: string;
	name: string;
	sortOrder: number;
}

export function sortedStatusTypes<T extends Pick<RankedStatusType, 'name' | 'sortOrder'>>(
	statusTypes: readonly T[]
): T[] {
	return [...statusTypes].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

export function compareOverlappingEntries(
	a: Omit<RankedEntry, 'personnelId'>,
	b: Omit<RankedEntry, 'personnelId'>,
	statusRank: ReadonlyMap<string, number>
): number {
	const rank = (entry: Omit<RankedEntry, 'personnelId'>) =>
		statusRank.get(entry.statusTypeId) ?? Number.MAX_SAFE_INTEGER;
	return rank(a) - rank(b) || a.startDate.localeCompare(b.startDate) || a.id.localeCompare(b.id);
}

export function shownEntryByPerson<E extends RankedEntry>(
	entries: readonly E[],
	statusTypes: readonly RankedStatusType[]
): Map<string, E> {
	const statusRank = new Map(sortedStatusTypes(statusTypes).map((type, index) => [type.id, index]));
	const shown = new Map<string, E>();
	for (const entry of entries) {
		const current = shown.get(entry.personnelId);
		if (!current || compareOverlappingEntries(entry, current, statusRank) < 0) shown.set(entry.personnelId, entry);
	}
	return shown;
}
