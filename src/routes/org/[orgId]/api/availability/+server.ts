import { createCrudHandlers } from '$lib/server/crudFactory';
import type { AvailabilityEntry } from '$lib/types';

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
	personnelIdField: 'personnel_id',
	auditResourceType: 'availability',
	auditDetailFields: ['personnel_id', 'status_type_id', 'start_date', 'end_date', 'note']
});

// Note: No PUT handler - availability entries are created/deleted, not updated
// Group scope is enforced by crudFactory via personnelIdField config
export const { POST, DELETE } = handlers;
