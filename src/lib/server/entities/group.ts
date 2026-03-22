import { z } from 'zod';
import { defineEntity, field } from '$lib/server/entitySchema';
import type { Group } from '$lib/stores/groups.svelte';

export const GroupEntity = defineEntity<Group>({
	table: 'groups',
	permission: 'personnel',
	groupScope: 'none',
	audit: { resourceType: 'group', detailFields: ['name'] },
	orderBy: [{ column: 'sort_order', ascending: true }],
	schema: {
		id: field(z.string(), { readOnly: true }),
		name: field(z.string().min(1).max(100)),
		sortOrder: field(z.number().int(), { column: 'sort_order', insertDefault: 0 })
	}
});
