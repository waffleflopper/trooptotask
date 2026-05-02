/**
 * Status type entity — maps `status_types` (named availability statuses shown on the calendar).
 * Calendar configuration policy decisions authorize mutations.
 * `color`/`textColor` are hex strings controlling how the status appears on the calendar.
 */
import { z } from 'zod';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { defineEntity, field } from '$lib/server/entitySchema';
import { DA6_AVAILABILITY_TREATMENTS, type StatusType } from '$lib/types';

export const StatusTypeEntity = defineEntity<StatusType>({
	table: 'status_types',
	permission: 'calendar',
	policyAction: POLICY_ACTION_CATALOG.calendar.configureStatusTypes,
	groupScope: 'none',
	audit: { resourceType: 'status_type', detailFields: ['name'] },
	orderBy: [{ column: 'sort_order', ascending: true }],
	schema: {
		id: field(z.string(), { readOnly: true }),
		name: field(z.string().min(1).max(100)),
		color: field(z.string(), { insertDefault: '#6b7280' }),
		textColor: field(z.string(), { column: 'text_color', insertDefault: '#ffffff' }),
		da6AvailabilityTreatment: field(z.enum(DA6_AVAILABILITY_TREATMENTS).nullable(), {
			column: 'da6_availability_treatment',
			insertDefault: null
		}),
		da6TreatmentReviewed: field(z.boolean(), { column: 'da6_treatment_reviewed', insertDefault: false }),
		sortOrder: field(z.number().int(), { column: 'sort_order', insertDefault: 0 })
	}
});
