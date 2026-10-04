import type { CalendarWritePorts } from '$lib/server/core/useCases/calendarPolicy';
type DataStore = CalendarWritePorts['store'];
import type { AssignmentType } from '$features/calendar/contracts';
import { AssignmentTypeEntity } from './assignmentTypeEntity.server';

/** The caller supplies its own Calendar, Dashboard, export, or report authority. */
export async function listAssignmentTypes(store: DataStore, orgId: string): Promise<AssignmentType[]> {
	const rows = await store.findMany<Record<string, unknown>>('assignment_types', orgId, undefined, {
		orderBy: [{ column: 'sort_order', ascending: true }]
	});
	return AssignmentTypeEntity.fromDbArray(rows);
}

/** Target choices for the separately authorized manual-assignment write. */
export function listAssignmentTypeTargets(
	store: DataStore,
	orgId: string,
	ids: string[]
): Promise<Array<{ id: string; assign_to: string }>> {
	return store.findMany<{ id: string; assign_to: string }>('assignment_types', orgId, undefined, {
		inFilters: { id: ids },
		select: 'id, assign_to'
	});
}

/** Saved row shape for a separately authorized Organization export. */
export function listAssignmentTypeExportRows(store: DataStore, orgId: string): Promise<Record<string, unknown>[]> {
	return store.findMany<Record<string, unknown>>('assignment_types', orgId);
}
