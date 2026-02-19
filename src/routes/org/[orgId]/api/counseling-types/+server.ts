import { createCrudHandlers } from '$lib/server/crudFactory';
import type { CounselingType } from '$lib/types/leadersBook';

const handlers = createCrudHandlers<CounselingType>({
	table: 'counseling_types',
	permission: 'personnel',
	fields: {
		templateContent: 'template_content',
		isFreeform: 'is_freeform',
		sortOrder: 'sort_order'
	},
	defaults: {
		description: null,
		template_content: null,
		recurrence: 'none',
		color: '#6b7280',
		is_freeform: false,
		sort_order: 0
	}
});

export const { POST, PUT, DELETE } = handlers;
