import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { fail } from '$lib/errors';
import { selectAllSupabaseRows } from '$lib/server/supabasePagination.server';
import type { CalendarCatalogPersistence, FederalHolidayDefault } from './contracts';
import {
	ASSIGNMENT_TYPE_FIELDS,
	SPECIAL_DAY_FIELDS,
	STATUS_TYPE_FIELDS,
	calendarIdChunks,
	toAssignmentType,
	toSpecialDay,
	toStatusType,
	type AssignmentTypeRow,
	type SpecialDayRow,
	type StatusTypeRow
} from './calendarPersistenceMapping.server';

export const CALENDAR_CHANGE_NOT_SAVED_MESSAGE =
	'Another Calendar change was saving at the same time, so this change was not saved. Try again.';
export const CALENDAR_CHANGE_UNCONFIRMED_MESSAGE =
	"We couldn't confirm this Calendar change. Reload to see what is saved.";

const federalHolidayRows = z
	.array(
		z.object({
			id: z.string(),
			organization_id: z.string(),
			date: z.string(),
			name: z.string(),
			type: z.literal('federal-holiday'),
			created_at: z.string()
		})
	)
	.min(1);

function holidayKeys(holidays: FederalHolidayDefault[]): string {
	return JSON.stringify(holidays.map(({ date, name }) => JSON.stringify([date, name])).sort());
}

// postgrest-js reports a failed fetch as an error with an empty code instead of rejecting.
async function calendarCommand<T>(
	client: SupabaseClient,
	name: string,
	args: Record<string, unknown>,
	result: z.ZodType<T>
): Promise<T> {
	const { data, error } = await client.rpc(name, args);
	if (error) {
		if (error.code === '42501') fail(403, 'You do not have access to configure the Calendar');
		if (error.code === 'P0002') fail(404, 'That assignment type is no longer available.');
		if (error.code === '22023' || error.code === '22P02') fail(400, 'Invalid Calendar configuration');
		if (['CLN01', 'STO01', '40P01', '40001', '55P03', '23505'].includes(error.code))
			fail(409, CALENDAR_CHANGE_NOT_SAVED_MESSAGE);
		if (!error.code) fail(503, CALENDAR_CHANGE_UNCONFIRMED_MESSAGE, { publicMessage: true });
		throw new Error(error.message);
	}
	const parsed = result.safeParse(data);
	if (!parsed.success) throw new Error(`${name} returned an unexpected result`);
	return parsed.data;
}

export function createSupabaseCalendarCatalogPersistence(
	client: SupabaseClient,
	orgId: string
): CalendarCatalogPersistence {
	return {
		async listStatusTypes() {
			const result = await selectAllSupabaseRows<StatusTypeRow>(async (from, to) => {
				const { data, error } = await client
					.from('status_types')
					.select(STATUS_TYPE_FIELDS)
					.eq('organization_id', orgId)
					.order('sort_order', { ascending: true })
					.order('id', { ascending: true })
					.range(from, to)
					.returns<StatusTypeRow[]>();
				return { data, error };
			});
			if (result.error) throw new Error((result.error as { message: string }).message);
			return (result.data ?? []).map(toStatusType);
		},
		async listStatusTypeLabels() {
			const result = await selectAllSupabaseRows<{ id: string; name: string }>(async (from, to) => {
				const { data, error } = await client
					.from('status_types')
					.select('id, name')
					.eq('organization_id', orgId)
					.order('id', { ascending: true })
					.range(from, to)
					.returns<Array<{ id: string; name: string }>>();
				return { data, error };
			});
			if (result.error) throw new Error((result.error as { message: string }).message);
			return result.data ?? [];
		},
		async createStatusType(input) {
			const last = await client
				.from('status_types')
				.select('sort_order')
				.eq('organization_id', orgId)
				.order('sort_order', { ascending: false })
				.limit(1)
				.maybeSingle<{ sort_order: number }>();
			if (last.error) throw new Error(last.error.message);
			const { data, error } = await client
				.from('status_types')
				.insert({
					organization_id: orgId,
					name: input.name,
					color: input.color ?? '#6b7280',
					text_color: input.textColor ?? '#ffffff',
					short_label: input.shortLabel ?? null,
					sort_order: last.data ? last.data.sort_order + 1 : 0
				})
				.select(STATUS_TYPE_FIELDS)
				.single<StatusTypeRow>();
			if (error) throw new Error(error.message);
			return toStatusType(data);
		},
		async updateStatusType(id, patch) {
			const { data, error } = await client
				.from('status_types')
				.update({
					name: patch.name,
					color: patch.color,
					text_color: patch.textColor,
					short_label: patch.shortLabel
				})
				.eq('organization_id', orgId)
				.eq('id', id)
				.select(STATUS_TYPE_FIELDS)
				.single<StatusTypeRow>();
			if (error) throw new Error(error.message);
			return toStatusType(data);
		},
		async deleteStatusType(id) {
			const { error } = await client.from('status_types').delete().eq('organization_id', orgId).eq('id', id);
			if (error) throw new Error(error.message);
		},
		async setStatusTypeOrder(statusTypeIds, expectedStatusTypeIds) {
			await calendarCommand(
				client,
				'set_status_type_order',
				{
					p_organization_id: orgId,
					p_status_type_ids: statusTypeIds,
					p_expected_status_type_ids: expectedStatusTypeIds
				},
				z.null()
			);
		},
		async listAssignmentTypes() {
			const result = await selectAllSupabaseRows<AssignmentTypeRow>(async (from, to) => {
				const { data, error } = await client
					.from('assignment_types')
					.select(ASSIGNMENT_TYPE_FIELDS)
					.eq('organization_id', orgId)
					.order('sort_order', { ascending: true })
					.order('id', { ascending: true })
					.range(from, to)
					.returns<AssignmentTypeRow[]>();
				return { data, error };
			});
			if (result.error) throw new Error((result.error as { message: string }).message);
			return (result.data ?? []).map(toAssignmentType);
		},
		async listAssignmentTypeTargets(ids) {
			const rows: Array<{ id: string; assignTo: 'personnel' | 'group' }> = [];
			for (const chunk of calendarIdChunks(ids)) {
				const result = await selectAllSupabaseRows<{ id: string; assign_to: string }>(async (from, to) => {
					const { data, error } = await client
						.from('assignment_types')
						.select('id, assign_to')
						.eq('organization_id', orgId)
						.in('id', chunk)
						.order('id', { ascending: true })
						.range(from, to)
						.returns<Array<{ id: string; assign_to: string }>>();
					return { data, error };
				});
				if (result.error) throw new Error((result.error as { message: string }).message);
				rows.push(
					...(result.data ?? []).map(({ id, assign_to }) => ({
						id,
						assignTo: assign_to === 'group' ? ('group' as const) : ('personnel' as const)
					}))
				);
			}
			return rows;
		},
		async createAssignmentType(input) {
			const { data, error } = await client
				.from('assignment_types')
				.insert({
					organization_id: orgId,
					name: input.name,
					short_name: input.shortName,
					assign_to: input.assignTo,
					color: input.color ?? '#6b7280',
					exempt_personnel_ids: input.exemptPersonnelIds ?? []
				})
				.select(ASSIGNMENT_TYPE_FIELDS)
				.single<AssignmentTypeRow>();
			if (error) throw new Error(error.message);
			return toAssignmentType(data);
		},
		async updateAssignmentType(id, patch) {
			const { data, error } = await client
				.from('assignment_types')
				.update({
					name: patch.name,
					short_name: patch.shortName,
					assign_to: patch.assignTo,
					color: patch.color,
					exempt_personnel_ids: patch.exemptPersonnelIds
				})
				.eq('organization_id', orgId)
				.eq('id', id)
				.select(ASSIGNMENT_TYPE_FIELDS)
				.single<AssignmentTypeRow>();
			if (error) throw new Error(error.message);
			return toAssignmentType(data);
		},
		async deleteAssignmentType(id) {
			const { error } = await client.from('assignment_types').delete().eq('organization_id', orgId).eq('id', id);
			if (error) throw new Error(error.message);
		},
		async listSpecialDays(range) {
			const result = await selectAllSupabaseRows<SpecialDayRow>(async (from, to) => {
				let query = client.from('special_days').select(SPECIAL_DAY_FIELDS).eq('organization_id', orgId);
				if (range)
					query = query.gte('date', range.rangeStart).lte('date', range.rangeEnd).order('date', { ascending: true });
				const { data, error } = await query.order('id', { ascending: true }).range(from, to).returns<SpecialDayRow[]>();
				return { data, error };
			});
			if (result.error) throw new Error((result.error as { message: string }).message);
			return (result.data ?? []).map(toSpecialDay);
		},
		async createSpecialDay(input) {
			const { data, error } = await client
				.from('special_days')
				.insert({ organization_id: orgId, date: input.date, name: input.name, type: input.type })
				.select(SPECIAL_DAY_FIELDS)
				.single<SpecialDayRow>();
			if (error) throw new Error(error.message);
			return toSpecialDay(data);
		},
		async updateSpecialDay(id, patch) {
			const { data, error } = await client
				.from('special_days')
				.update({ date: patch.date, name: patch.name, type: patch.type })
				.eq('organization_id', orgId)
				.eq('id', id)
				.select(SPECIAL_DAY_FIELDS)
				.single<SpecialDayRow>();
			if (error) throw new Error(error.message);
			return toSpecialDay(data);
		},
		async deleteSpecialDay(id) {
			const { error } = await client.from('special_days').delete().eq('organization_id', orgId).eq('id', id);
			if (error) throw new Error(error.message);
		},
		async resetFederalHolidays(holidays) {
			const rows = await calendarCommand(
				client,
				'reset_federal_holidays',
				{ p_organization_id: orgId, p_holidays: holidays },
				federalHolidayRows
			);
			if (
				new Set(rows.map(({ id }) => id)).size !== rows.length ||
				rows.some((row) => row.organization_id !== orgId) ||
				holidayKeys(rows) !== holidayKeys(holidays)
			)
				throw new Error('reset_federal_holidays returned an incomplete result');
			return rows.map((row) => ({ ...toSpecialDay(row), type: row.type }));
		},
		async setCalendarLanes(laneTypeIds, expectedLaneTypeIds) {
			await calendarCommand(
				client,
				'set_calendar_lanes',
				{
					p_organization_id: orgId,
					p_lane_type_ids: laneTypeIds,
					p_expected_lane_type_ids: expectedLaneTypeIds
				},
				z.null()
			);
		}
	};
}
