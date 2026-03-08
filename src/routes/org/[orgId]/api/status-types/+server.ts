import { createCrudHandlers } from '$lib/server/crudFactory';
import type { StatusType } from '$lib/types';

const handlers = createCrudHandlers<StatusType>({
	table: 'status_types',
	permission: 'calendar',
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
