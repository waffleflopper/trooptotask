import { json, error } from '@sveltejs/kit';
import { apiRoute } from '$lib/server/apiRoute';
import {
	transformAvailabilityEntries,
	transformDailyAssignments,
	transformAssignmentTypes
} from '$lib/server/transforms';

export const GET = apiRoute(
	{ permission: { privileged: true }, readOnly: false, audit: 'calendar_report' },
	async ({ supabase, orgId }, event) => {
		// Validate query params
		const startDate = event.url.searchParams.get('startDate');
		const endDate = event.url.searchParams.get('endDate');

		if (!startDate || !endDate) {
			throw error(400, 'startDate and endDate query params are required');
		}

		if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
			throw error(400, 'Dates must be in YYYY-MM-DD format');
		}

		if (startDate > endDate) {
			throw error(400, 'startDate must be before or equal to endDate');
		}

		// Query availability entries for the date range
		const { data, error: dbError } = await supabase
			.from('availability_entries')
			.select('*')
			.eq('organization_id', orgId)
			.gte('end_date', startDate)
			.lte('start_date', endDate);

		if (dbError) {
			throw error(500, 'Failed to fetch availability data');
		}

		// Query daily assignments for the date range
		const { data: assignmentsData, error: assignmentsError } = await supabase
			.from('daily_assignments')
			.select('*')
			.eq('organization_id', orgId)
			.gte('date', startDate)
			.lte('date', endDate);

		if (assignmentsError) {
			throw error(500, 'Failed to fetch daily assignments');
		}

		// Query assignment types for the org
		const { data: assignmentTypesData, error: assignmentTypesError } = await supabase
			.from('assignment_types')
			.select('*')
			.eq('organization_id', orgId);

		if (assignmentTypesError) {
			throw error(500, 'Failed to fetch assignment types');
		}

		return json({
			entries: transformAvailabilityEntries(data ?? []),
			assignments: transformDailyAssignments(assignmentsData ?? []),
			assignmentTypes: transformAssignmentTypes(assignmentTypesData ?? [])
		});
	}
);
