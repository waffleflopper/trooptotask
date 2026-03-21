import { createCrudHandlers } from '$lib/server/crudFactory';
import { notifyAdmins } from '$lib/server/notifications';
import type { AssignmentType } from '$lib/types';

const handlers = createCrudHandlers<AssignmentType>({
	table: 'assignment_types',
	permission: 'calendar',
	requireFullEditor: true,
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
	auditDetailFields: ['name', 'short_name'],
	onAfterDelete: async ({ orgId, userId, userEmail, deletedDetails }) => {
		await notifyAdmins(orgId, userId, {
			type: 'config_type_deleted',
			title: 'Assignment Type Deleted',
			message: `"${userEmail}" deleted the assignment type "${deletedDetails?.name ?? 'unknown'}".`
		});
	}
});

export const { POST, PUT, DELETE } = handlers;
