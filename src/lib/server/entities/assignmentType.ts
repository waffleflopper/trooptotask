import { z } from 'zod';
import { defineEntity, field } from '$lib/server/entitySchema';
import { notifyAdmins } from '$lib/server/notifications';
import type { AssignmentType } from '$lib/types';

export const AssignmentTypeEntity = defineEntity<AssignmentType>({
	table: 'assignment_types',
	permission: 'calendar',
	requireFullEditor: true,
	groupScope: 'none',
	audit: { resourceType: 'assignment_type', detailFields: ['name', 'short_name'] },
	orderBy: [{ column: 'sort_order', ascending: true }],
	onAfterDelete: async ({ orgId, userId, userEmail, deletedDetails }) => {
		await notifyAdmins(orgId, userId, {
			type: 'config_type_deleted',
			title: 'Assignment Type Deleted',
			message: `"${userEmail}" deleted the assignment type "${deletedDetails?.name ?? 'unknown'}".`
		});
	},
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
