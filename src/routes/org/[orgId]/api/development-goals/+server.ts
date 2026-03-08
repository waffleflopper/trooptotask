import { createCrudHandlers } from '$lib/server/crudFactory';
import type { DevelopmentGoal } from '$lib/types/leadersBook';

const handlers = createCrudHandlers<DevelopmentGoal>({
	table: 'development_goals',
	permission: 'personnel',
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
	auditResourceType: 'development_goal',
	auditDetailFields: ['personnel_id', 'category', 'status']
});

export const { POST, PUT, DELETE } = handlers;
