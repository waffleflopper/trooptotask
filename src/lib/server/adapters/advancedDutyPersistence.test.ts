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

	it('calls the draft snapshot replacement RPC with the expected payload', async () => {
		const rpc = vi.fn().mockResolvedValue({
			data: { id: 'snapshot-1', draft_lineage_key: 'lineage-1' },
			error: null
		});
		const adapter = createSupabaseAdvancedDutyPersistenceAdapter({ rpc } as unknown as SupabaseClient);

		const result = await adapter.replaceDraftAdvancedRunSnapshot({
			orgId: 'org-1',
			draftLineageKey: 'lineage-1',
			snapshotData: { template_id: 'template-1', draft_lineage_key: 'lineage-1' }
		});

		expect(result).toEqual({ id: 'snapshot-1', draft_lineage_key: 'lineage-1' });
		expect(rpc).toHaveBeenCalledWith('replace_advanced_duty_run_snapshot', {
			p_org_id: 'org-1',
			p_draft_lineage_key: 'lineage-1',
			p_snapshot_data: { template_id: 'template-1', draft_lineage_key: 'lineage-1' }
		});
	});

	it('prefixes template RPC errors with the function name', async () => {
		const rpc = vi.fn().mockResolvedValue({
			data: null,
			error: { message: 'function does not exist' }
		});
		const adapter = createSupabaseAdvancedDutyPersistenceAdapter({ rpc } as unknown as SupabaseClient);

		await expect(
			adapter.updateDutyTemplateAggregate({
				orgId: 'org-1',
				templateId: 'template-1',
				templateData: {},
				slotRows: [],
				rotationBaselineRows: []
			})
		).rejects.toThrow('update_advanced_duty_template_aggregate: function does not exist');
	});

	it('prefixes event RPC errors with the function name', async () => {
		const rpc = vi.fn().mockResolvedValue({
			data: null,
			error: { message: 'function does not exist' }
		});
		const adapter = createSupabaseAdvancedDutyPersistenceAdapter({ rpc } as unknown as SupabaseClient);

		await expect(
			adapter.updateDutyEventAggregate({
				orgId: 'org-1',
				dutyEventId: 'event-1',
				eventData: {},
				slotRows: []
			})
		).rejects.toThrow('update_advanced_duty_event_aggregate: function does not exist');
	});

	it('prefixes draft snapshot replacement RPC errors with the function name', async () => {
		const rpc = vi.fn().mockResolvedValue({
			data: null,
			error: { message: 'duplicate key value violates unique constraint' }
		});
		const adapter = createSupabaseAdvancedDutyPersistenceAdapter({ rpc } as unknown as SupabaseClient);

		await expect(
			adapter.replaceDraftAdvancedRunSnapshot({
				orgId: 'org-1',
				draftLineageKey: 'lineage-1',
				snapshotData: {}
			})
		).rejects.toThrow('replace_advanced_duty_run_snapshot: duplicate key value violates unique constraint');
	});
});
