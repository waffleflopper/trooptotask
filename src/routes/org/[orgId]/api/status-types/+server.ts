import { createCrudHandlers } from '$lib/server/crudFactory';
import { notifyAdmins } from '$lib/server/notifications';
import type { StatusType } from '$lib/types';

const handlers = createCrudHandlers<StatusType>({
	table: 'status_types',
	permission: 'calendar',
	requireFullEditor: true,
	fields: {
		textColor: 'text_color',
		sortOrder: 'sort_order'
	},
	defaults: {
		color: '#6b7280',
		text_color: '#ffffff',
		sort_order: 0
	},
	auditResourceType: 'status_type',
	auditDetailFields: ['name'],
	onAfterDelete: async ({ orgId, userId, userEmail, deletedDetails }) => {
		await notifyAdmins(orgId, userId, {
			type: 'config_type_deleted',
			title: 'Status Type Deleted',
			message: `"${userEmail}" deleted the status type "${(deletedDetails as any)?.name ?? 'unknown'}".`
		});
	},
	// Cascade delete: remove availability entries with this status type
	onDelete: async (supabase, orgId, id) => {
		await supabase
			.from('availability_entries')
			.delete()
			.eq('status_type_id', id)
			.eq('organization_id', orgId);
	}
});

export const { POST, PUT, DELETE } = handlers;
