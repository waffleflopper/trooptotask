import { z } from 'zod';
import { defineEntity, field } from '$lib/server/entitySchema';
import type { DutyTemplateRecord } from '$features/duty-roster/duty-roster.types';

export const DutyTemplateEntity = defineEntity<DutyTemplateRecord>({
	table: 'duty_templates',
	groupScope: 'none',
	schema: {
		id: field(z.string(), { readOnly: true }),
		orgId: field(z.string(), { column: 'organization_id', readOnly: true }),
		mode: field(z.enum(['simple', 'advanced']), { insertDefault: 'advanced' }),
		status: field(z.enum(['draft', 'active', 'archived']), { insertDefault: 'draft' }),
		name: field(z.string().min(1).max(120)),
		description: field(z.string().nullable(), { insertDefault: null }),
		scopeType: field(z.enum(['organization', 'groups']), { column: 'scope_type', insertDefault: 'organization' }),
		scopeGroupIds: field(z.array(z.string()), {
			column: 'scope_group_ids',
			insertDefault: [],
			nullDefault: []
		}),
		coverageMode: field(z.enum(['all-day', 'timed']), {
			column: 'coverage_mode',
			insertDefault: 'all-day'
		}),
		startTime: field(z.string().nullable(), { column: 'start_time', insertDefault: null }),
		endTime: field(z.string().nullable(), { column: 'end_time', insertDefault: null }),
		isBlocking: field(z.boolean(), { column: 'is_blocking', insertDefault: false }),
		cooldownHours: field(z.number().int().min(0), {
			column: 'cooldown_hours',
			insertDefault: 0
		}),
		createdAt: field(z.string(), { column: 'created_at', readOnly: true }),
		updatedAt: field(z.string(), { column: 'updated_at', readOnly: true })
	}
});
