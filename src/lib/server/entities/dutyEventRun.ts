import { z } from 'zod';
import { defineEntity, field } from '$lib/server/entitySchema';
import type { DutyEventRunRecord } from '$features/duty-roster/duty-roster.types';

export const DutyEventRunEntity = defineEntity<DutyEventRunRecord>({
	table: 'duty_event_runs',
	permission: 'calendar',
	groupScope: 'none',
	audit: { resourceType: 'duty_event_run' },
	schema: {
		id: field(z.string(), { readOnly: true }),
		orgId: field(z.string(), { column: 'organization_id', readOnly: true }),
		templateId: field(z.string().nullable(), { column: 'template_id', insertDefault: null }),
		templateName: field(z.string(), { column: 'template_name' }),
		pattern: field(
			z.enum([
				'single',
				'daily',
				'weekday-only',
				'weekend-only',
				'selected-weekdays',
				'holiday-closure-only',
				'custom-dates'
			]),
			{ insertDefault: 'single' }
		),
		startDate: field(z.string(), { column: 'start_date' }),
		endDate: field(z.string(), { column: 'end_date' }),
		eventCount: field(z.number().int().min(0), { column: 'event_count', insertDefault: 0 }),
		isLegacy: field(z.boolean(), { column: 'is_legacy', insertDefault: false }),
		createdAt: field(z.string(), { column: 'created_at', readOnly: true }),
		updatedAt: field(z.string(), { column: 'updated_at', readOnly: true })
	}
});
