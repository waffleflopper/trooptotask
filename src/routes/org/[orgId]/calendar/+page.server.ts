import type { PageServerLoad } from './$types';
import { getSupabaseClient } from '$lib/server/supabase';
import { formatDate } from '$lib/utils/dates';
import {
	transformAvailabilityEntries,
	transformSpecialDays,
	transformAssignmentTypes,
	transformDailyAssignments,
	transformRosterHistory
} from '$lib/server/transforms';

export const load: PageServerLoad = async ({ params, locals, cookies }) => {
	const { orgId } = params;
	const userId = locals.user?.id ?? null;
	const supabase = getSupabaseClient(locals, cookies);

	// Date range for calendar data (3 months past, 6 months future)
	const now = new Date();
	const rangeStart = new Date(now.getFullYear(), now.getMonth() - 3, 1);
	const rangeEnd = new Date(now.getFullYear(), now.getMonth() + 7, 0);
	const rangeStartStr = formatDate(rangeStart);
	const rangeEndStr = formatDate(rangeEnd);

	const [availabilityRes, specialDaysRes, assignmentTypesRes, dailyAssignmentsRes, pinnedGroupsRes, rosterHistoryRes] =
		await Promise.all([
			supabase
				.from('availability_entries')
				.select('*')
				.eq('organization_id', orgId)
				.gte('end_date', rangeStartStr)
				.lte('start_date', rangeEndStr),
			supabase
				.from('special_days')
				.select('*')
				.eq('organization_id', orgId)
				.gte('date', rangeStartStr)
				.lte('date', rangeEndStr)
				.order('date'),
			supabase.from('assignment_types').select('*').eq('organization_id', orgId).order('sort_order'),
			supabase
				.from('daily_assignments')
				.select('*')
				.eq('organization_id', orgId)
				.gte('date', rangeStartStr)
				.lte('date', rangeEndStr),
			userId
				? supabase
						.from('user_pinned_groups')
						.select('*')
						.eq('organization_id', orgId)
						.eq('user_id', userId)
						.order('sort_order')
				: Promise.resolve({ data: [] }),
			supabase
				.from('duty_roster_history')
				.select('*')
				.eq('organization_id', orgId)
				.order('created_at', { ascending: false })
				.limit(50)
		]);

	const availabilityEntries = transformAvailabilityEntries(availabilityRes.data ?? []);
	const specialDays = transformSpecialDays(specialDaysRes.data ?? []);
	const assignmentTypes = transformAssignmentTypes(assignmentTypesRes.data ?? []);
	const dailyAssignments = transformDailyAssignments(dailyAssignmentsRes.data ?? []);

	const pinnedGroups: string[] = (pinnedGroupsRes.data ?? []).map(
		(p: Record<string, unknown>) => p.group_name as string
	);

	const rosterHistory = transformRosterHistory(rosterHistoryRes.data ?? []);

	return {
		orgId,
		availabilityEntries,
		specialDays,
		assignmentTypes,
		dailyAssignments,
		pinnedGroups,
		rosterHistory
	};
};
