/**
 * Availability entry entity — maps `availability_entries`.
 * Group-scoped via `personnel_id` column. POST/DELETE use generated handlers;
 * the Calendar route owns a narrow PUT that cannot change personnel_id.
 * For bulk operations, see `availabilityBatch.ts`.
 */
import { z } from 'zod';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { defineEntity, field } from '$lib/server/entitySchema';
import type { AvailabilityEntry } from '$lib/types';

export const AvailabilityEntryEntity = defineEntity<AvailabilityEntry>({
	table: 'availability_entries',
	policyAction: POLICY_ACTION_CATALOG.calendar.manageAvailability,
	methods: ['POST', 'DELETE'],
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
