import { createCrudHandlers } from '$lib/server/crudFactory';
import type { AvailabilityEntry } from '$lib/types';

const handlers = createCrudHandlers<AvailabilityEntry>({
	table: 'availability_entries',
	permission: 'calendar',
	fields: {
		personnelId: 'personnel_id',
		statusTypeId: 'status_type_id',
		startDate: 'start_date',
		endDate: 'end_date'
	}
});

// Note: No PUT handler - availability entries are created/deleted, not updated
export const { POST, DELETE } = handlers;
