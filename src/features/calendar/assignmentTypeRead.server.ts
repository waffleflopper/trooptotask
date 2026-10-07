import type { CalendarCatalogPersistence, SavedAssignmentType } from './contracts';

/** The caller supplies its own Calendar, Dashboard, export, or report authority. */
export function listAssignmentTypes(
	catalogs: Pick<CalendarCatalogPersistence, 'listAssignmentTypes'>
): Promise<SavedAssignmentType[]> {
	return catalogs.listAssignmentTypes();
}

/** Target choices for the separately authorized manual-assignment write. */
export function listAssignmentTypeTargets(
	catalogs: Pick<CalendarCatalogPersistence, 'listAssignmentTypeTargets'>,
	ids: string[]
): Promise<Array<{ id: string; assignTo: 'personnel' | 'group' }>> {
	return catalogs.listAssignmentTypeTargets(ids);
}
