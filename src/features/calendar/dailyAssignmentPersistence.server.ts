import type { SupabaseClient } from '@supabase/supabase-js';
import type { PostgrestError } from '@supabase/supabase-js';
import type { CalendarAssignmentReplacementPort } from '$features/calendar/contracts';
import type { SavedAssignment } from '$features/calendar/contracts';
import { fail } from '$lib/errors';

const SLOT_UNAVAILABLE = 'This assignment slot is unavailable. Refresh the Calendar and try again.';

type DailyAssignmentRow = {
	id: string;
	date: string;
	assignment_type_id: string;
	assignee_id: string;
	organization_id: string;
	created_at: string;
};

/** Only the server may mark a pick as roster, so roster writes run with the service role on behalf of `actorId`. */
export function createSupabaseCalendarAssignmentReplacementPort(
	supabase: SupabaseClient,
	roster: { admin: () => SupabaseClient; actorId: string }
): CalendarAssignmentReplacementPort {
	return {
		async replace(orgId, replaceDays, slots): Promise<SavedAssignment[]> {
			const { data, error } = await supabase.rpc('replace_daily_assignment_slots', {
				p_organization_id: orgId,
				p_replace_days: replaceDays,
				p_slots: slots.map(toSlotRow)
			});
			if (error) failReplacement(error);
			return ((data ?? []) as DailyAssignmentRow[]).map(toSavedAssignment);
		},
		async writeRoster(orgId, slots): Promise<SavedAssignment[]> {
			const { data, error } = await roster.admin().rpc('write_roster_assignment_slots', {
				p_actor: roster.actorId,
				p_organization_id: orgId,
				p_slots: slots.map((slot) => ({ ...toSlotRow(slot), was: slot.was, source: slot.source }))
			});
			if (error) failReplacement(error);
			return ((data ?? []) as DailyAssignmentRow[]).map(toSavedAssignment);
		}
	};
}

function toSlotRow(slot: { date: string; assignmentTypeId: string; assigneeId: string }) {
	return { date: slot.date, assignment_type_id: slot.assignmentTypeId, assignee_id: slot.assigneeId };
}

function failReplacement(error: PostgrestError): never {
	if (
		(error.code === 'P0001' && error.message === 'Assignment slot unavailable') ||
		(error.code === '23505' &&
			error.message.includes('unique constraint "daily_assignments_clinic_id_assignment_type_id_date_key"'))
	) {
		fail(409, SLOT_UNAVAILABLE);
	}
	if (error.code === '42501') fail(403, 'You do not have access to that Calendar scope');
	throw new Error(error.message);
}

function toSavedAssignment(row: DailyAssignmentRow): SavedAssignment {
	return {
		id: row.id,
		date: row.date,
		assignmentTypeId: row.assignment_type_id,
		assigneeId: row.assignee_id,
		organization_id: row.organization_id,
		created_at: row.created_at
	};
}
