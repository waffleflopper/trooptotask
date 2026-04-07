import { describe, expect, it } from 'vitest';
import { DutyEventSlotEntity } from './dutyEventSlot';

describe('DutyEventSlotEntity', () => {
	it('rejects medium fairness confidence in the persisted schema', () => {
		const result = DutyEventSlotEntity.createSchema.safeParse({
			dutyEventId: 'event-1',
			templateSlotId: 'slot-1',
			roleLabel: 'NCO',
			slotIndex: 0,
			assigneeId: 'person-1',
			assignmentSource: 'generated',
			warningState: 'warning',
			fairnessConfidence: 'medium',
			selectionReason: null,
			unfilledReason: null,
			sortOrder: 0
		});

		expect(result.success).toBe(false);
	});

	it('accepts high and low fairness confidence in persisted rows', () => {
		const high = DutyEventSlotEntity.fromDb({
			id: 'slot-high',
			organization_id: 'org-1',
			duty_event_id: 'event-1',
			template_slot_id: 'template-slot-1',
			role_label: 'NCO',
			slot_index: 0,
			assignee_id: 'person-1',
			assignment_source: 'generated',
			warning_state: 'none',
			fairness_confidence: 'high',
			selection_reason: null,
			unfilled_reason: null,
			sort_order: 0,
			created_at: '2026-04-01T00:00:00Z'
		});

		const low = DutyEventSlotEntity.fromDb({
			id: 'slot-low',
			organization_id: 'org-1',
			duty_event_id: 'event-1',
			template_slot_id: 'template-slot-1',
			role_label: 'NCO',
			slot_index: 0,
			assignee_id: 'person-1',
			assignment_source: 'generated',
			warning_state: 'warning',
			fairness_confidence: 'low',
			selection_reason: null,
			unfilled_reason: null,
			sort_order: 0,
			created_at: '2026-04-01T00:00:00Z'
		});

		expect(high.fairnessConfidence).toBe('high');
		expect(low.fairnessConfidence).toBe('low');
	});
});
