import { createCrudHandlers } from '$lib/server/crudFactory';
import { apiRoute } from '$lib/server/apiRoute';
import { error } from '@sveltejs/kit';
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
export const POST = apiRoute(
	{ permission: { authenticated: true }, readOnly: false },
	async ({ supabase, orgId, isSandbox, ctx }, event) => {
		if (!isSandbox) {
			const body = await event.request.clone().json();
			const personnelId = body.personnelId;

			if (personnelId) {
				if (ctx.scopedGroupId) {
					const { data: person } = await supabase
						.from('personnel')
						.select('group_id')
						.eq('id', personnelId)
						.eq('organization_id', orgId)
						.single();

					if (!person) throw error(404, 'Personnel not found');

					if (person.group_id !== ctx.scopedGroupId) {
						throw error(403, 'You do not have access to personnel outside your group');
					}
				}
			}
		}

		return handlers.POST(event);
	}
);

// Wrap DELETE to enforce group scope before delegating to the CRUD handler
export const DELETE = apiRoute(
	{ permission: { authenticated: true }, readOnly: false },
	async ({ supabase, orgId, isSandbox, ctx }, event) => {
		if (!isSandbox) {
			const body = await event.request.clone().json();
			const entryId = body.id;

			if (entryId) {
				// Look up the availability entry to get personnel_id
				const { data: entry } = await supabase
					.from('availability_entries')
					.select('personnel_id')
					.eq('id', entryId)
					.eq('organization_id', orgId)
					.single();

				if (!entry) throw error(404, 'Availability entry not found');

				if (ctx.scopedGroupId) {
					// Look up the personnel's group_id
					const { data: person } = await supabase
						.from('personnel')
						.select('group_id')
						.eq('id', entry.personnel_id)
						.eq('organization_id', orgId)
						.single();

					if (!person) throw error(404, 'Personnel not found');

					if (person.group_id !== ctx.scopedGroupId) {
						throw error(403, 'You do not have access to personnel outside your group');
					}
				}
			}
		}

		return handlers.DELETE(event);
	}
);
