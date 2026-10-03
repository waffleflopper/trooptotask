import type { SupabaseClient } from '@supabase/supabase-js';
import { selectAllSupabaseRows } from '$lib/server/supabasePagination.server';
import type { CalendarSupportReader } from './supportReadTypes';

type CalendarCatalogTable = 'status_types' | 'assignment_types';

async function countCatalog(
	client: SupabaseClient,
	table: CalendarCatalogTable,
	ids: string[]
): Promise<Map<string, number>> {
	type Row = { id: string; organization_id: string };
	const { data, error } = await selectAllSupabaseRows<Row>(
		(from, to) =>
			client
				.from(table)
				.select('id, organization_id')
				.in('organization_id', ids)
				.order('organization_id', { ascending: true })
				.order('id', { ascending: true })
				.range(from, to) as unknown as Promise<{ data: Row[] | null; error: unknown }>
	);
	if (error) throw error;
	const counts = new Map<string, number>();
	for (const row of data ?? []) counts.set(row.organization_id, (counts.get(row.organization_id) ?? 0) + 1);
	return counts;
}

/** Calendar keeps the setup catalog selection inside its own provider. */
export function createCalendarSupportReader(client: SupabaseClient): CalendarSupportReader {
	return {
		async countCatalogsByOrganization(organizationIds) {
			const ids = [...new Set(organizationIds.filter(Boolean))];
			if (ids.length === 0) return { statusTypes: new Map(), assignmentTypes: new Map() };
			const [statusTypes, assignmentTypes] = await Promise.all([
				countCatalog(client, 'status_types', ids),
				countCatalog(client, 'assignment_types', ids)
			]);
			return { statusTypes, assignmentTypes };
		}
	};
}
