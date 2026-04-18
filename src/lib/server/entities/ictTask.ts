import { z } from 'zod';
import { defineEntity, field } from '$lib/server/entitySchema';
import type { IctTask } from '$features/critical-tasks/criticalTasks.types';

export const IctTaskEntity = defineEntity<IctTask>({
	table: 'ict_tasks',
	permission: 'training',
	requirePrivileged: true,
	groupScope: 'none',
	methods: ['POST', 'PUT'],
	audit: { resourceType: 'ict_task', detailFields: ['taskCode', 'title'] },
	orderBy: [
		{ column: 'sort_order', ascending: true },
		{ column: 'task_code', ascending: true }
	],
	schema: {
		id: field(z.string(), { readOnly: true }),
		taskCode: field(z.string().min(1).max(64), { column: 'task_code' }),
		title: field(z.string().min(1).max(200)),
		description: field(z.string().max(2000).nullable().optional(), {
			insertDefault: null
		}),
		category: field(z.string().max(120).nullable().optional(), {
			insertDefault: null
		}),
		mos: field(z.array(z.string()), {
			insertDefault: [],
			nullDefault: []
		}),
		expirationMonths: field(z.number().int().positive().nullable(), {
			column: 'expiration_months',
			insertDefault: null
		}),
		sortOrder: field(z.number().int().min(0), {
			column: 'sort_order',
			insertDefault: 0
		}),
		archivedAt: field(z.string().nullable(), {
			column: 'archived_at',
			insertDefault: null
		}),
		createdAt: field(z.string(), {
			column: 'created_at',
			readOnly: true
		})
	}
});
