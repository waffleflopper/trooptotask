import type { SupabaseClient } from '$lib/server/database';
import { selectAllSupabaseRows } from '$lib/server/supabasePagination.server';
import type { CalendarSupportReader } from './supportReadTypes';

type CalendarCatalogTable = 'status_types' | 'assignment_types';

async function countCatalog(
	client: SupabaseClient,
	table: CalendarCatalogTable,
	ids: string[]
): Promise<Map<string, number>> {
	type Row = { id: string; organization_id: string };
	const requested = new Map(ids.map((value) => [value.toLowerCase(), value]));
	const { data, error } = await selectAllSupabaseRows<Row>(async (from, to) => {
		const result = await client
			.from(table)
			.select('id, organization_id')
			.in('organization_id', ids)
			.order('organization_id', { ascending: true })
			.order('id', { ascending: true })
			.range(from, to);
		if (result.error) throw result.error;
		if (!Array.isArray(result.data)) throw new Error('Calendar setup facts were unavailable');
		const data = result.data.map((value) => {
			if (
				!value ||
				typeof value !== 'object' ||
				Array.isArray(value) ||
				typeof value.id !== 'string' ||
				!value.id ||
				typeof value.organization_id !== 'string'
			)
				throw new Error('Calendar setup facts were unavailable');
			const organizationId = requested.get(value.organization_id.toLowerCase());
			if (!organizationId) throw new Error('Calendar setup facts were unavailable');
			return { id: value.id, organization_id: organizationId };
		});
		return { ...result, data };
	});
	if (error) throw error;
	const counts = new Map<string, number>();
	if (!data) throw new Error('Calendar setup facts were unavailable');
	for (const row of data) counts.set(row.organization_id, (counts.get(row.organization_id) ?? 0) + 1);
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
