/** Personnel's persisted Group shape, validation and row mapping. */
import { z } from 'zod';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { defineEntity, field } from '$lib/server/entitySchema';
import type { Group } from './contracts';

export const GroupEntity = defineEntity<Group>({
	table: 'groups',
	policyAction: POLICY_ACTION_CATALOG.personnel.manageGroups,
	groupScope: 'none',
	audit: { resourceType: 'group', detailFields: ['name'] },
	orderBy: [{ column: 'sort_order', ascending: true }],
	schema: {
		id: field(z.string(), { readOnly: true }),
		name: field(z.string().min(1).max(100)),
		sortOrder: field(z.number().int(), { column: 'sort_order', insertDefault: 0 })
	}
});
