/**
 * Status type entity — maps `status_types` (named availability statuses shown on the calendar).
 * Calendar configuration policy decisions authorize mutations.
 * `color`/`textColor` are hex strings controlling how the status appears on the calendar.
 */
import { z } from 'zod';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { defineEntity, field } from '$lib/server/entitySchema';
import type { StatusType } from '$lib/types';

export const StatusTypeEntity = defineEntity<StatusType>({
	table: 'status_types',
	select: 'id, organization_id, name, color, text_color, sort_order, created_at',
	policyAction: POLICY_ACTION_CATALOG.calendar.configureStatusTypes,
	groupScope: 'none',
	audit: { resourceType: 'status_type', detailFields: ['name'] },
	orderBy: [{ column: 'sort_order', ascending: true }],
	schema: {
		id: field(z.string(), { readOnly: true }),
		name: field(z.string().min(1).max(100)),
		color: field(z.string(), { insertDefault: '#6b7280' }),
		textColor: field(z.string(), { column: 'text_color', insertDefault: '#ffffff' }),
		sortOrder: field(z.number().int(), { column: 'sort_order', insertDefault: 0 })
	},
	customTransform: (row) => ({
		id: row.id as string,
		name: row.name as string,
		color: row.color as string,
		textColor: row.text_color as string,
		...(row.sort_order !== undefined ? { sortOrder: row.sort_order } : {}),
		...(row.organization_id !== undefined ? { organization_id: row.organization_id } : {}),
		...(row.created_at !== undefined ? { created_at: row.created_at } : {})
	})
});
