import { z } from 'zod';
import { defineEntity, field } from '$lib/server/entitySchema';
import type { StatusType } from '$lib/types';

export const StatusTypeEntity = defineEntity<StatusType>({
	table: 'status_types',
	permission: 'calendar',
	requireFullEditor: true,
	groupScope: 'none',
	audit: { resourceType: 'status_type', detailFields: ['name'] },
	orderBy: [{ column: 'sort_order', ascending: true }],
	schema: {
		id: field(z.string(), { readOnly: true }),
		name: field(z.string().min(1).max(100)),
		color: field(z.string(), { insertDefault: '#6b7280' }),
		textColor: field(z.string(), { column: 'text_color', insertDefault: '#ffffff' }),
		sortOrder: field(z.number().int(), { column: 'sort_order', insertDefault: 0 })
	}
});
