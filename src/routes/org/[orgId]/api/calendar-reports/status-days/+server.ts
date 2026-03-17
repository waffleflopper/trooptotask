import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isPrivilegedRole } from '$lib/server/permissions';
import {
	transformAvailabilityEntries,
	transformDailyAssignments,
	transformAssignmentTypes
} from '$lib/server/transforms';

export const GET: RequestHandler = async ({ params, url, locals }) => {
	const supabase = locals.supabase;
	const user = locals.user;
	if (!user) throw error(401, 'Not authenticated');

	const orgId = params.orgId;

	// Permission check: owner or admin only
	const { data: membership } = await supabase
		.from('organization_memberships')
		.select('role')
		.eq('organization_id', orgId)
		.eq('user_id', user.id)
		.single();

	if (!membership || !isPrivilegedRole(membership.role)) {
		throw error(403, 'Only owners and admins can access reports');
	}

	// Validate query params
	const startDate = url.searchParams.get('startDate');
	const endDate = url.searchParams.get('endDate');

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
};
