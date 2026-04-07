import { z } from 'zod';
import { defineEntity, field } from '$lib/server/entitySchema';
import type { DutyTemplateRotationBaseline } from '$features/duty-roster/duty-roster.types';

type DutyTemplateRotationBaselineEntityRecord = DutyTemplateRotationBaseline & {
	orgId: string;
	createdAt: string;
};

export const DutyTemplateRotationBaselineEntity = defineEntity<DutyTemplateRotationBaselineEntityRecord>({
	table: 'duty_template_rotation_baselines',
	permission: 'calendar',
	groupScope: 'none',
	schema: {
		id: field(z.string(), { readOnly: true }),
		orgId: field(z.string(), { column: 'organization_id', readOnly: true }),
		templateId: field(z.string(), { column: 'template_id' }),
		rotationPoolKey: field(z.string().min(1).max(120), { column: 'rotation_pool_key' }),
		personId: field(z.string(), { column: 'person_id' }),
		lastServedDate: field(z.string(), { column: 'last_served_date' }),
		createdAt: field(z.string(), { column: 'created_at', readOnly: true })
	}
});
