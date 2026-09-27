/**
 * Assignment type entity — maps `assignment_types` (named Calendar assignments, e.g., "CQ", "SDO").
 * Calendar configuration policy decisions authorize mutations.
 * `assignTo` controls whether this type assigns to individual `personnel` or a `group`.
 * `exemptPersonnelIds` is a Postgres array of UUIDs stored directly on the row.
 */
import { z } from 'zod';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { defineEntity, field } from '$lib/server/entitySchema';
import type { AssignmentType } from '$lib/types';

export const AssignmentTypeEntity = defineEntity<AssignmentType>({
	table: 'assignment_types',
	policyAction: POLICY_ACTION_CATALOG.calendar.configureAssignmentTypes,
	groupScope: 'none',
	audit: { resourceType: 'assignment_type', detailFields: ['name', 'short_name'] },
	orderBy: [{ column: 'sort_order', ascending: true }],
	schema: {
		id: field(z.string(), { readOnly: true }),
		name: field(z.string().min(1).max(100)),
		shortName: field(z.string(), { column: 'short_name' }),
		assignTo: field(z.enum(['personnel', 'group']), { column: 'assign_to' }),
		color: field(z.string(), { insertDefault: '#6b7280' }),
		sortOrder: field(z.number().int(), { column: 'sort_order', insertDefault: 0 }),
		showInDateHeader: field(z.boolean(), {
			column: 'show_in_date_header',
			insertDefault: false
		}),
		exemptPersonnelIds: field(z.array(z.string()), {
			column: 'exempt_personnel_ids',
			insertDefault: [],
			nullDefault: []
		}),
		archivedAt: field(z.string().nullable().optional(), { column: 'archived_at', readOnly: true })
	}
});
