import { z } from 'zod';
import { defineEntity, field } from '$lib/server/entitySchema';
import type { DutyTemplateRotationBaseline } from '$features/duty-roster/duty-roster.types';

export const DutyTemplateRotationBaselineEntity = defineEntity<DutyTemplateRotationBaseline>({
	table: 'duty_template_rotation_baselines',
	groupScope: 'none',
	schema: {
		id: field(z.string(), { readOnly: true }),
		templateId: field(z.string(), { column: 'template_id' }),
		rotationPoolKey: field(z.string().min(1).max(120), { column: 'rotation_pool_key' }),
		personId: field(z.string(), { column: 'person_id' }),
		lastServedDate: field(z.string(), { column: 'last_served_date' })
	}
});
