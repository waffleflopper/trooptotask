import { z } from 'zod';
import { defineEntity, field } from '$lib/server/entitySchema';
import {
	PERSISTED_SOFT_PREFERENCE_TYPES,
	cloneDefaultSoftPreferences,
	type DutyTemplateRecord
} from '$features/duty-roster/duty-roster.types';

const softPreferenceConfigSchema = z.object({
	type: z.enum(PERSISTED_SOFT_PREFERENCE_TYPES),
	enabled: z.boolean()
});

const defaultSoftPreferences = cloneDefaultSoftPreferences();

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
		exemptPersonnelIds: field(z.array(z.string()), {
			column: 'exempt_personnel_ids',
			insertDefault: [],
			nullDefault: []
		}),
		exemptStatusTypeIds: field(z.array(z.string()), {
			column: 'exempt_status_type_ids',
			insertDefault: [],
			nullDefault: []
		}),
		coverageMode: field(z.enum(['all-day', 'timed']), {
			column: 'coverage_mode',
			insertDefault: 'all-day'
		}),
		startTime: field(z.string().nullable(), { column: 'start_time', insertDefault: null }),
		endTime: field(z.string().nullable(), { column: 'end_time', insertDefault: null }),
		spansMidnight: field(z.boolean(), { column: 'spans_midnight', insertDefault: false, nullDefault: false }),
		isBlocking: field(z.boolean(), { column: 'is_blocking', insertDefault: false }),
		cooldownHours: field(z.number().int().min(0), {
			column: 'cooldown_hours',
			insertDefault: 0
		}),
		softPreferences: field(z.array(softPreferenceConfigSchema), {
			column: 'soft_preferences',
			insertDefault: defaultSoftPreferences,
			nullDefault: defaultSoftPreferences
		}),
		createdAt: field(z.string(), { column: 'created_at', readOnly: true }),
		updatedAt: field(z.string(), { column: 'updated_at', readOnly: true })
	}
});
