import type { SupabaseClient } from '@supabase/supabase-js';
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

export function createSupabaseCalendarAssignmentReplacementPort(
	supabase: SupabaseClient
): CalendarAssignmentReplacementPort {
	return {
		async replace(orgId, replaceDays, slots): Promise<SavedAssignment[]> {
			const { data, error } = await supabase.rpc('replace_daily_assignment_slots', {
				p_organization_id: orgId,
				p_replace_days: replaceDays,
				p_slots: slots.map((slot) => ({
					date: slot.date,
					assignment_type_id: slot.assignmentTypeId,
					assignee_id: slot.assigneeId
				}))
			});

			if (error) {
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

			return ((data ?? []) as DailyAssignmentRow[]).map((row) => ({
				id: row.id,
				date: row.date,
				assignmentTypeId: row.assignment_type_id,
				assigneeId: row.assignee_id,
				organization_id: row.organization_id,
				created_at: row.created_at
			}));
		}
	};
}
