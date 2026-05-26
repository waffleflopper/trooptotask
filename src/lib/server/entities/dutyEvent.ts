import { z } from 'zod';
import { defineEntity, field } from '$lib/server/entitySchema';
import type { DutyEvent } from '$features/duty-roster/duty-roster.types';

export const DutyEventEntity = defineEntity<DutyEvent>({
	table: 'duty_events',
	groupScope: 'none',
	audit: { resourceType: 'duty_event' },
	schema: {
		id: field(z.string(), { readOnly: true }),
		orgId: field(z.string(), { column: 'organization_id', readOnly: true }),
		runId: field(z.string().nullable(), { column: 'run_id', insertDefault: null }),
		templateId: field(z.string(), { column: 'template_id' }),
		templateName: field(z.string(), { column: 'template_name' }),
		eventDate: field(z.string(), { column: 'event_date' }),
		coverageMode: field(z.enum(['all-day', 'timed']), { column: 'coverage_mode' }),
		coverageStart: field(z.string(), { column: 'coverage_start' }),
		coverageEnd: field(z.string(), { column: 'coverage_end' }),
		isBlocking: field(z.boolean(), { column: 'is_blocking', insertDefault: false }),
		cooldownHours: field(z.number().int().min(0), { column: 'cooldown_hours', insertDefault: 0 }),
		rulesSnapshot: field(z.any(), { column: 'rules_snapshot' }),
		fillSummary: field(z.any(), { column: 'fill_summary' }),
		collisionSummary: field(z.any(), { column: 'collision_summary' }),
		originalProposal: field(z.any().nullable(), { column: 'original_proposal', insertDefault: null }),
		createdAt: field(z.string(), { column: 'created_at', readOnly: true }),
		updatedAt: field(z.string(), { column: 'updated_at', readOnly: true })
	}
});
