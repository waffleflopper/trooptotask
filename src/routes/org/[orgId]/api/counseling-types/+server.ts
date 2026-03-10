import { createCrudHandlers } from '$lib/server/crudFactory';
import { notifyAdmins } from '$lib/server/notifications';
import type { CounselingType } from '$lib/types/leadersBook';

const handlers = createCrudHandlers<CounselingType>({
	table: 'counseling_types',
	permission: 'personnel',
	requireFullEditor: true,
	fields: {
		templateContent: 'template_content',
		templateFilePath: 'template_file_path',
		isFreeform: 'is_freeform',
		sortOrder: 'sort_order'
	},
	defaults: {
		description: null,
		template_content: null,
		template_file_path: null,
		recurrence: 'none',
		color: '#6b7280',
		is_freeform: false,
		sort_order: 0
	},
	auditResourceType: 'counseling_type',
	auditDetailFields: ['name'],
	onAfterDelete: async ({ orgId, userId, userEmail, deletedDetails }) => {
		await notifyAdmins(orgId, userId, {
			type: 'config_type_deleted',
			title: 'Counseling Type Deleted',
			message: `"${userEmail}" deleted the counseling type "${(deletedDetails as any)?.name ?? 'unknown'}".`
		});
	}
});

export const { POST, PUT, DELETE } = handlers;
