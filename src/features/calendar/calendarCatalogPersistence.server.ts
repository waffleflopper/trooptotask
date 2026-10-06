import type { SupabaseClient } from '@supabase/supabase-js';
import { selectAllSupabaseRows } from '$lib/server/supabasePagination.server';
import type { CalendarCatalogPersistence } from './contracts';
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
					.range(from, to)
					.returns<Array<{ id: string; name: string }>>();
				return { data, error };
			});
			if (result.error) throw new Error((result.error as { message: string }).message);
			return result.data ?? [];
		},
		async createStatusType(input) {
			const { data, error } = await client
				.from('status_types')
				.insert({
					organization_id: orgId,
					name: input.name,
					color: input.color ?? '#6b7280',
					text_color: input.textColor ?? '#ffffff',
					sort_order: input.sortOrder ?? 0
				})
				.select(STATUS_TYPE_FIELDS)
				.single<StatusTypeRow>();
			if (error) throw new Error(error.message);
			return toStatusType(data);
		},
		async updateStatusType(id, patch) {
			const { data, error } = await client
				.from('status_types')
				.update({ name: patch.name, color: patch.color, text_color: patch.textColor, sort_order: patch.sortOrder })
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
		async listAssignmentTypes() {
			const result = await selectAllSupabaseRows<AssignmentTypeRow>(async (from, to) => {
				const { data, error } = await client
					.from('assignment_types')
					.select(ASSIGNMENT_TYPE_FIELDS)
					.eq('organization_id', orgId)
					.order('sort_order', { ascending: true })
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
					sort_order: input.sortOrder ?? 0,
					show_in_date_header: input.showInDateHeader ?? false,
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
					sort_order: patch.sortOrder,
					show_in_date_header: patch.showInDateHeader,
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
				const { data, error } = await query.range(from, to).returns<SpecialDayRow[]>();
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
		async deleteFederalHolidays() {
			const { error } = await client
				.from('special_days')
				.delete()
				.eq('organization_id', orgId)
				.eq('type', 'federal-holiday');
			if (error) throw new Error(error.message);
		},
		async createFederalHolidays(inputs) {
			if (inputs.length === 0) return;
			const { error } = await client
				.from('special_days')
				.insert(
					inputs.map((input) => ({ organization_id: orgId, date: input.date, name: input.name, type: input.type }))
				);
			if (error) throw new Error(error.message);
		}
	};
}
