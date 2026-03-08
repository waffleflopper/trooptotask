import { createCrudHandlers } from '$lib/server/crudFactory';
import type { Group } from '$lib/stores/groups.svelte';

const handlers = createCrudHandlers<Group>({
	table: 'groups',
	permission: 'personnel',
	fields: {
		sortOrder: 'sort_order'
	},
	defaults: {
		sort_order: 0
	},
	auditResourceType: 'group'
});

export const { POST, PUT, DELETE } = handlers;
