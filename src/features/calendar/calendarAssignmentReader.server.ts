import type { SupabaseClient } from '$lib/server/database';
import { selectAllSupabaseRows } from '$lib/server/supabasePagination.server';
import type { AssignmentSource, CalendarAssignmentReader } from './contracts';
import { ASSIGNMENT_FIELDS, toAssignment, type AssignmentRow } from './calendarPersistenceMapping.server';

export function createSupabaseCalendarAssignmentReader(
	client: SupabaseClient,
	orgId: string
): CalendarAssignmentReader {
	return {
		async listRange(range) {
			const result = await selectAllSupabaseRows<AssignmentRow>(async (from, to) => {
				let query = client
					.from('daily_assignments')
					.select(ASSIGNMENT_FIELDS)
					.eq('organization_id', orgId)
					.gte('date', range.rangeStart)
					.lte('date', range.rangeEnd);
				if (range.assigneeIds) query = query.in('assignee_id', [...range.assigneeIds]);
				const { data, error } = await query.order('id', { ascending: true }).range(from, to).returns<AssignmentRow[]>();
				return { data, error };
			});
			if (result.error) throw new Error((result.error as { message: string }).message);
			return (result.data ?? []).map(toAssignment);
		},
		async listDayReferences(date, assignmentTypeId) {
			const result = await selectAllSupabaseRows<{ assignment_type_id: string; assignee_id: string }>(
				async (from, to) => {
					let query = client
						.from('daily_assignments')
						.select('assignment_type_id, assignee_id')
						.eq('organization_id', orgId)
						.eq('date', date);
					if (assignmentTypeId !== undefined) query = query.eq('assignment_type_id', assignmentTypeId);
					const { data, error } = await query
						.order('id', { ascending: true })
						.range(from, to)
						.returns<Array<{ assignment_type_id: string; assignee_id: string }>>();
					return { data, error };
				}
			);
			if (result.error) throw new Error((result.error as { message: string }).message);
			return (result.data ?? []).map((row) => ({
				assignmentTypeId: row.assignment_type_id,
				assigneeId: row.assignee_id
			}));
		},
		async listRosterDetailDays(assignmentTypeId, span) {
			const result = await selectAllSupabaseRows<{ date: string; assignee_id: string; source: string }>(
				async (from, to) =>
					client
						.rpc('list_roster_detail_days', {
							p_organization_id: orgId,
							p_assignment_type_id: assignmentTypeId,
							p_from: span.from,
							p_through: span.through
						})
						.order('date')
						.order('assignee_id')
						.range(from, to)
			);
			if (result.error) throw new Error((result.error as { message: string }).message);
			return (result.data ?? []).map((row) => ({
				date: row.date,
				assigneeId: row.assignee_id,
				source: row.source as AssignmentSource
			}));
		},
		async listSlotReferences(slots) {
			const pairs = [...new Map(slots.map((slot) => [`${slot.date}/${slot.assignmentTypeId}`, slot])).values()];
			const rows: Array<{ date: string; assignmentTypeId: string; assigneeId: string }> = [];
			for (let start = 0; start < pairs.length; start += 100) {
				const chunk = pairs.slice(start, start + 100);
				const allowed = new Set(chunk.map((slot) => `${slot.date}/${slot.assignmentTypeId}`));
				const result = await selectAllSupabaseRows<{ date: string; assignment_type_id: string; assignee_id: string }>(
					async (from, to) => {
						const { data, error } = await client
							.from('daily_assignments')
							.select('date, assignment_type_id, assignee_id')
							.eq('organization_id', orgId)
							.in('date', [...new Set(chunk.map((slot) => slot.date))])
							.in('assignment_type_id', [...new Set(chunk.map((slot) => slot.assignmentTypeId))])
							.order('id', { ascending: true })
							.range(from, to)
							.returns<Array<{ date: string; assignment_type_id: string; assignee_id: string }>>();
						return { data, error };
					}
				);
				if (result.error) throw new Error((result.error as { message: string }).message);
				rows.push(
					...(result.data ?? [])
						.filter((row) => allowed.has(`${row.date}/${row.assignment_type_id}`))
						.map((row) => ({ date: row.date, assignmentTypeId: row.assignment_type_id, assigneeId: row.assignee_id }))
				);
			}
			return rows;
		}
	};
}
