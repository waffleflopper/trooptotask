import type { CalendarWritePorts } from '$lib/server/core/useCases/calendarPolicy';
type DataStore = CalendarWritePorts['store'];
import type { StatusType } from '$features/calendar/contracts';
import { StatusTypeEntity } from './statusTypeEntity.server';

/** The caller supplies its own Calendar, Personnel, export, or audit authority. */
export async function listStatusTypes(store: DataStore, orgId: string): Promise<StatusType[]> {
	const rows = await store.findMany<Record<string, unknown>>('status_types', orgId, undefined, {
		select: StatusTypeEntity.select,
		orderBy: [{ column: 'sort_order', ascending: true }]
	});
	return StatusTypeEntity.fromDbArray(rows);
}

/** Narrow label lookup for a separately authorized Personnel export. */
export function listStatusTypeLabels(store: DataStore, orgId: string): Promise<Array<{ id: string; name: string }>> {
	return store.findMany<{ id: string; name: string }>('status_types', orgId, undefined, { select: 'id, name' });
}
