import { createCrudHandlers } from '$lib/server/crudFactory';
import type { DevelopmentGoal } from '$features/counseling/counseling.types';

const handlers = createCrudHandlers<DevelopmentGoal>({
	table: 'development_goals',
	permission: 'leaders-book',
	personnelIdField: 'personnel_id',
	fields: {
		personnelId: 'personnel_id',
		targetDate: 'target_date',
		progressNotes: 'progress_notes'
	},
	defaults: {
		description: null,
		category: 'career',
		priority: 'medium',
		status: 'not-started',
		target_date: null,
		progress_notes: null
	},
	requireDeletionApproval: true,
	auditResourceType: 'development_goal',
	auditDetailFields: ['personnel_id', 'category', 'status']
});

export const { POST, PUT, DELETE } = handlers;
