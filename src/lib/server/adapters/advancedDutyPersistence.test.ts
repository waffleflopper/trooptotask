import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseAdvancedDutyPersistenceAdapter } from './advancedDutyPersistence';

describe('AdvancedDutyPersistenceAdapter', () => {
	it('calls the template aggregate RPC with the expected payload', async () => {
		const rpc = vi.fn().mockResolvedValue({
			data: {
				templateRow: { id: 'template-1' },
				slotRows: [],
				rotationBaselineRows: []
			},
			error: null
		});
		const adapter = createSupabaseAdvancedDutyPersistenceAdapter({ rpc } as unknown as SupabaseClient);

		const result = await adapter.updateDutyTemplateAggregate({
			orgId: 'org-1',
			templateId: 'template-1',
			templateData: { name: 'Template' },
			slotRows: [{ role_label: 'NCO' }],
			rotationBaselineRows: [{ rotation_pool_key: 'pool-a' }]
		});

		expect(result).toEqual({
			templateRow: { id: 'template-1' },
			slotRows: [],
			rotationBaselineRows: []
		});
		expect(rpc).toHaveBeenCalledWith('update_advanced_duty_template_aggregate', {
			p_org_id: 'org-1',
			p_template_id: 'template-1',
			p_template_data: { name: 'Template' },
			p_slot_rows: [{ role_label: 'NCO' }],
			p_rotation_baseline_rows: [{ rotation_pool_key: 'pool-a' }]
		});
	});

	it('calls the event aggregate RPC with the expected payload', async () => {
		const rpc = vi.fn().mockResolvedValue({
			data: {
				eventRow: { id: 'event-1' },
				slotRows: []
			},
			error: null
		});
		const adapter = createSupabaseAdvancedDutyPersistenceAdapter({ rpc } as unknown as SupabaseClient);

		const result = await adapter.updateDutyEventAggregate({
			orgId: 'org-1',
			dutyEventId: 'event-1',
			eventData: { template_name: 'Staff Duty' },
			slotRows: [{ role_label: 'NCO' }]
		});

		expect(result).toEqual({
			eventRow: { id: 'event-1' },
			slotRows: []
		});
		expect(rpc).toHaveBeenCalledWith('update_advanced_duty_event_aggregate', {
			p_org_id: 'org-1',
			p_duty_event_id: 'event-1',
			p_event_data: { template_name: 'Staff Duty' },
			p_slot_rows: [{ role_label: 'NCO' }]
		});
	});
});
