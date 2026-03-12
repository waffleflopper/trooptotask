import { createCrudHandlers } from '$lib/server/crudFactory';
import { requireGroupAccess } from '$lib/server/permissions';
import { getApiContext } from '$lib/server/supabase';
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { AvailabilityEntry } from '$features/calendar/calendar.types';

const handlers = createCrudHandlers<AvailabilityEntry>({
	table: 'availability_entries',
	permission: 'calendar',
	fields: {
		personnelId: 'personnel_id',
		statusTypeId: 'status_type_id',
		startDate: 'start_date',
		endDate: 'end_date',
		note: 'note'
	},
	auditResourceType: 'availability',
	auditDetailFields: ['personnel_id', 'status_type_id', 'start_date', 'end_date', 'note']
});

// Note: No PUT handler - availability entries are created/deleted, not updated

// Wrap POST to enforce group scope before delegating to the CRUD handler
export const POST: RequestHandler = async (event) => {
	const { orgId } = event.params;
	const { userId, isSandbox } = getApiContext(event.locals, event.cookies, orgId);

	if (!isSandbox && userId) {
		const body = await event.request.clone().json();
		const personnelId = body.personnelId;

		if (personnelId) {
			const { data: person } = await event.locals.supabase
				.from('personnel')
				.select('group_id')
				.eq('id', personnelId)
				.eq('organization_id', orgId)
				.single();

			if (!person) throw error(404, 'Personnel not found');

			await requireGroupAccess(event.locals.supabase, orgId, userId, person.group_id);
		}
	}

	return handlers.POST(event);
};

// Wrap DELETE to enforce group scope before delegating to the CRUD handler
export const DELETE: RequestHandler = async (event) => {
	const { orgId } = event.params;
	const { userId, isSandbox } = getApiContext(event.locals, event.cookies, orgId);

	if (!isSandbox && userId) {
		const body = await event.request.clone().json();
		const entryId = body.id;

		if (entryId) {
			// Look up the availability entry to get personnel_id
			const { data: entry } = await event.locals.supabase
				.from('availability_entries')
				.select('personnel_id')
				.eq('id', entryId)
				.eq('organization_id', orgId)
				.single();

			if (!entry) throw error(404, 'Availability entry not found');

			// Look up the personnel's group_id
			const { data: person } = await event.locals.supabase
				.from('personnel')
				.select('group_id')
				.eq('id', entry.personnel_id)
				.eq('organization_id', orgId)
				.single();

			if (!person) throw error(404, 'Personnel not found');

			await requireGroupAccess(event.locals.supabase, orgId, userId, person.group_id);
		}
	}

	return handlers.DELETE(event);
};
