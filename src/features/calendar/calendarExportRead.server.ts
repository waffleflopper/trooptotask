import type { SupabaseClient } from '@supabase/supabase-js';
import { selectAllSupabaseRows } from '$lib/server/supabasePagination.server';
import { STATUS_TYPE_FIELDS } from './calendarPersistenceMapping.server';
import { RequestFailure } from '$lib/errors';

const EXPORT_TABLES = [
	'status_types',
	'availability_entries',
	'assignment_types',
	'daily_assignments',
	'special_days',
	'roster_forms',
	'roster_starting_numbers',
	'roster_excusals',
	'calendar_events',
	'calendar_event_activity',
	'calendar_taskings',
	'calendar_tasking_activity',
	'calendar_tasking_participants'
] as const;

export type CalendarExportTable = (typeof EXPORT_TABLES)[number];

export interface CalendarExportReader {
	listRows(table: CalendarExportTable): Promise<Record<string, unknown>[]>;
}

export function createSupabaseCalendarExportReader(client: SupabaseClient, orgId: string): CalendarExportReader {
	return {
		async listRows(table) {
			if (!EXPORT_TABLES.includes(table)) {
				throw new RequestFailure(400, 'Unsupported Calendar export table');
			}
			const result = await selectAllSupabaseRows<Record<string, unknown>>(async (from, to) => {
				const query = client
					.from(table)
					.select(table === 'status_types' ? STATUS_TYPE_FIELDS : '*')
					.eq('organization_id', orgId);
				const ordered =
					table === 'roster_starting_numbers'
						? query
								.order('form_id', { ascending: true })
								.order('personnel_id', { ascending: true })
								.order('track', { ascending: true })
						: table === 'calendar_tasking_participants'
							? query.order('tasking_id', { ascending: true }).order('personnel_id', { ascending: true })
							: query.order('id', { ascending: true });
				const { data, error } = await ordered.range(from, to).returns<Record<string, unknown>[]>();
				return { data, error };
			});
			if (result.error)
				throw new Error((result.error as { message?: string }).message ?? 'Calendar export read failed');
			return result.data ?? [];
		}
	};
}
