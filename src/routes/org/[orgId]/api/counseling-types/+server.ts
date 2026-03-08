import { createCrudHandlers } from '$lib/server/crudFactory';
import type { CounselingType } from '$lib/types/leadersBook';

const handlers = createCrudHandlers<CounselingType>({
	table: 'counseling_types',
	permission: 'personnel',
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
	auditResourceType: 'counseling_type'
});

export const { POST, PUT, DELETE } = handlers;
