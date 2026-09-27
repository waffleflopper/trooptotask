import type { CalendarWritePorts } from '$lib/server/core/useCases/calendarPolicy';
import type { StatusType } from '$lib/types';
import { StatusTypeEntity } from './statusTypeEntity.server';

/** The caller supplies its own Calendar, Personnel, export, or audit authority. */
type StatusTypeStore = CalendarWritePorts['store'];

export async function listStatusTypes(store: StatusTypeStore, orgId: string): Promise<StatusType[]> {
	const rows = await store.findMany<Record<string, unknown>>('status_types', orgId, undefined, {
		select: StatusTypeEntity.select,
		orderBy: [{ column: 'sort_order', ascending: true }]
	});
	return StatusTypeEntity.fromDbArray(rows);
}

/** Narrow label lookup for a separately authorized Personnel export. */
export function listStatusTypeLabels(
	store: StatusTypeStore,
	orgId: string
): Promise<Array<{ id: string; name: string }>> {
	return store.findMany<{ id: string; name: string }>('status_types', orgId, undefined, { select: 'id, name' });
}

/** Saved row shape for a separately authorized Organization export. */
export function listStatusTypeExportRows(store: StatusTypeStore, orgId: string): Promise<Record<string, unknown>[]> {
	return store.findMany<Record<string, unknown>>('status_types', orgId, undefined, {
		select: StatusTypeEntity.select
	});
}
