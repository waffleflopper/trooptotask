import { z } from 'zod';
import { defineEntity, field } from '$lib/server/entitySchema';
import type { DutyEventSlotInstance } from '$features/duty-roster/duty-roster.types';

export const DutyEventSlotEntity = defineEntity<DutyEventSlotInstance>({
	table: 'duty_event_slots',
	permission: 'calendar',
	groupScope: 'none',
	audit: { resourceType: 'duty_event_slot' },
	schema: {
		id: field(z.string(), { readOnly: true }),
		dutyEventId: field(z.string(), { column: 'duty_event_id' }),
		templateSlotId: field(z.string().nullable(), { column: 'template_slot_id', insertDefault: null }),
		roleLabel: field(z.string(), { column: 'role_label' }),
		slotIndex: field(z.number().int().min(0), { column: 'slot_index' }),
		assigneeId: field(z.string().nullable(), { column: 'assignee_id', insertDefault: null }),
		assignmentSource: field(z.enum(['generated', 'manual', 'locked']), {
			column: 'assignment_source',
			insertDefault: 'generated'
		}),
		warningState: field(z.enum(['none', 'warning']), {
			column: 'warning_state',
			insertDefault: 'none'
		}),
		unfilledReason: field(z.string().nullable(), { column: 'unfilled_reason', insertDefault: null }),
		sortOrder: field(z.number().int().min(0), { column: 'sort_order', insertDefault: 0 })
	}
});
