import type { SupabaseClient } from '@supabase/supabase-js';
import { selectAllSupabaseRows } from '$lib/server/supabasePagination.server';
import { STATUS_TYPE_FIELDS } from './calendarPersistenceMapping.server';
import { RequestFailure } from '$lib/errors';

const EXPORT_TABLES = [
	'status_types',
	'availability_entries',
	'assignment_types',
	'daily_assignments',
	'special_days'
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
				const { data, error } = await client
					.from(table)
					.select(table === 'status_types' ? STATUS_TYPE_FIELDS : '*')
					.eq('organization_id', orgId)
					.range(from, to)
					.returns<Record<string, unknown>[]>();
				return { data, error };
			});
			if (result.error)
				throw new Error((result.error as { message?: string }).message ?? 'Calendar export read failed');
			return result.data ?? [];
		}
	};
}
