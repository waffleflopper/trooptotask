import { z } from 'zod';
import { defineEntity, field } from '$lib/server/entitySchema';
import { notifyAdmins } from '$lib/server/notifications';
import type { StatusType } from '$lib/types';

export const StatusTypeEntity = defineEntity<StatusType>({
	table: 'status_types',
	permission: 'calendar',
	requireFullEditor: true,
	groupScope: 'none',
	audit: { resourceType: 'status_type', detailFields: ['name'] },
	orderBy: [{ column: 'sort_order', ascending: true }],
	onDelete: async (supabase, orgId, id) => {
		await supabase.from('availability_entries').delete().eq('status_type_id', id).eq('organization_id', orgId);
	},
	onAfterDelete: async ({ orgId, userId, userEmail, deletedDetails }) => {
		await notifyAdmins(orgId, userId, {
			type: 'config_type_deleted',
			title: 'Status Type Deleted',
			message: `"${userEmail}" deleted the status type "${deletedDetails?.name ?? 'unknown'}".`
		});
	},
	schema: {
		id: field(z.string(), { readOnly: true }),
		name: field(z.string().min(1).max(100)),
		color: field(z.string(), { insertDefault: '#6b7280' }),
		textColor: field(z.string(), { column: 'text_color', insertDefault: '#ffffff' }),
		sortOrder: field(z.number().int(), { column: 'sort_order', insertDefault: 0 })
	}
});
