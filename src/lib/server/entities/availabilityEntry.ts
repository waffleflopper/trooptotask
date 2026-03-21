import { z } from 'zod';
import { defineEntity, field } from '$lib/server/entitySchema';
import type { AvailabilityEntry } from '$lib/types';

export const AvailabilityEntryEntity = defineEntity<AvailabilityEntry>({
	table: 'availability_entries',
	permission: 'calendar',
	groupScope: { personnelColumn: 'personnel_id' },
	audit: {
		resourceType: 'availability',
		detailFields: ['personnel_id', 'status_type_id', 'start_date', 'end_date', 'note']
	},
	schema: {
		id: field(z.string(), { readOnly: true }),
		personnelId: field(z.string(), { column: 'personnel_id', isPersonnelId: true }),
		statusTypeId: field(z.string(), { column: 'status_type_id' }),
		startDate: field(z.string(), { column: 'start_date' }),
		endDate: field(z.string(), { column: 'end_date' }),
		note: field(z.string().nullable().optional(), { insertDefault: null })
	}
});
