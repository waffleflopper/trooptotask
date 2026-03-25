import { z } from 'zod';
import { defineEntity, field } from '$lib/server/entitySchema';
import type { TrainingView } from '$features/training/training.types';

export const TrainingViewEntity = defineEntity<TrainingView>({
	table: 'training_views',
	permission: 'training',
	requireFullEditor: true,
	groupScope: 'none',
	audit: { resourceType: 'training_view', detailFields: ['name'] },
	orderBy: [{ column: 'name', ascending: true }],
	schema: {
		id: field(z.string(), { readOnly: true }),
		name: field(z.string().min(1).max(100)),
		columnIds: field(z.array(z.string()), {
			column: 'column_ids',
			insertDefault: [],
			nullDefault: []
		}),
		createdBy: field(z.string(), { column: 'created_by', readOnly: true }),
		createdAt: field(z.string(), { column: 'created_at', readOnly: true }),
		updatedAt: field(z.string(), { column: 'updated_at', readOnly: true })
	}
});
