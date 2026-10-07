import type { CalendarCatalogPersistence, SavedStatusType } from './contracts';

/** The caller supplies its own Calendar, Personnel, export, or audit authority. */
export function listStatusTypes(
	catalogs: Pick<CalendarCatalogPersistence, 'listStatusTypes'>
): Promise<SavedStatusType[]> {
	return catalogs.listStatusTypes();
}

/** Narrow label lookup for a separately authorized Personnel export. */
export function listStatusTypeLabels(
	catalogs: Pick<CalendarCatalogPersistence, 'listStatusTypeLabels'>
): Promise<Array<{ id: string; name: string }>> {
	return catalogs.listStatusTypeLabels();
}
