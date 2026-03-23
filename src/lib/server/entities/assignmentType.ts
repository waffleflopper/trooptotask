import { z } from 'zod';
import { defineEntity, field } from '$lib/server/entitySchema';
import type { AssignmentType } from '$lib/types';

export const AssignmentTypeEntity = defineEntity<AssignmentType>({
	table: 'assignment_types',
	permission: 'calendar',
	requireFullEditor: true,
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
		exemptPersonnelIds: field(z.array(z.string()), {
			column: 'exempt_personnel_ids',
			insertDefault: [],
			nullDefault: []
		})
	}
});
