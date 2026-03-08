import { createCrudHandlers } from '$lib/server/crudFactory';
import type { AssignmentType } from '$lib/stores/dailyAssignments.svelte';

const handlers = createCrudHandlers<AssignmentType>({
	table: 'assignment_types',
	permission: 'calendar',
	fields: {
		shortName: 'short_name',
		assignTo: 'assign_to',
		sortOrder: 'sort_order'
	},
	defaults: {
		color: '#6b7280',
		sort_order: 0
	},
	auditResourceType: 'assignment_type',
	auditDetailFields: ['name', 'short_name']
});

export const { POST, PUT, DELETE } = handlers;
