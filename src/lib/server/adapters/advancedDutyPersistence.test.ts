import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createInMemoryDataStore } from './inMemory';
import {
	createInMemoryAdvancedDutyPersistenceAdapter,
	createSupabaseAdvancedDutyPersistenceAdapter
} from './advancedDutyPersistence';

function queryBuilder(result: unknown) {
	return {
		select: vi.fn().mockReturnThis(),
		eq: vi.fn().mockReturnThis(),
		in: vi.fn().mockReturnThis(),
		order: vi.fn().mockReturnThis(),
		maybeSingle: vi.fn().mockResolvedValue(result),
		single: vi.fn().mockResolvedValue(result),
		insert: vi.fn().mockReturnThis(),
		update: vi.fn().mockReturnThis(),
		delete: vi.fn().mockReturnThis(),
		then: vi.fn((resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
			Promise.resolve(result).then(resolve, reject)
		)
	};
}

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

	it('reads the active revision draft from the approved draft table', async () => {
		const draftRow = { id: 'draft-1', applied_run_id: 'run-1', status: 'draft' };
		const builder = queryBuilder({ data: draftRow, error: null });
		const from = vi.fn().mockReturnValue(builder);
		const adapter = createSupabaseAdvancedDutyPersistenceAdapter({ from } as unknown as SupabaseClient);

		const result = await adapter.findActiveAdvancedDutyRevisionDraft({
			orgId: 'org-1',
			appliedRunId: 'run-1'
		});

		expect(result).toEqual(draftRow);
		expect(from).toHaveBeenCalledWith('advanced_duty_revision_drafts');
		expect(builder.select).toHaveBeenCalledWith('*');
		expect(builder.eq).toHaveBeenCalledWith('organization_id', 'org-1');
		expect(builder.eq).toHaveBeenCalledWith('applied_run_id', 'run-1');
		expect(builder.eq).toHaveBeenCalledWith('status', 'draft');
	});

	it('filters listed revision drafts by status when requested', async () => {
		const draftRows = [{ id: 'draft-1', status: 'draft' }];
		const builder = queryBuilder({ data: draftRows, error: null });
		const from = vi.fn().mockReturnValue(builder);
		const adapter = createSupabaseAdvancedDutyPersistenceAdapter({ from } as unknown as SupabaseClient);

		const result = await adapter.listAdvancedDutyRevisionDrafts({
			orgId: 'org-1',
			statuses: ['draft', 'discarded']
		});

		expect(result).toEqual(draftRows);
		expect(from).toHaveBeenCalledWith('advanced_duty_revision_drafts');
		expect(builder.select).toHaveBeenCalledWith('*');
		expect(builder.eq).toHaveBeenCalledWith('organization_id', 'org-1');
		expect(builder.in).toHaveBeenCalledWith('status', ['draft', 'discarded']);
		expect(builder.order).toHaveBeenCalledWith('updated_at', { ascending: false });
	});

	it('writes revision change sets and slot changes to the approved history tables', async () => {
		const changeSetBuilder = queryBuilder({ data: { id: 'change-set-1' }, error: null });
		const slotBuilder = queryBuilder({ data: [{ id: 'slot-change-1' }], error: null });
		const from = vi.fn().mockReturnValueOnce(changeSetBuilder).mockReturnValueOnce(slotBuilder);
		const adapter = createSupabaseAdvancedDutyPersistenceAdapter({ from } as unknown as SupabaseClient);

		const result = await adapter.appendAdvancedDutyRevisionChangeSet({
			orgId: 'org-1',
			changeSetData: {
				id: 'change-set-1',
				organization_id: 'org-1',
				applied_run_id: 'run-1',
				reason: 'Coverage changed'
			},
			slotChangeRows: [
				{
					id: 'slot-change-1',
					organization_id: 'org-1',
					change_set_id: 'change-set-1',
					event_date: '2026-05-02',
					slot_key: 'slot-nco:0'
				}
			]
		});

		expect(result).toEqual({
			changeSetRow: { id: 'change-set-1' },
			slotChangeRows: [{ id: 'slot-change-1' }]
		});
		expect(from).toHaveBeenNthCalledWith(1, 'advanced_duty_revision_change_sets');
		expect(from).toHaveBeenNthCalledWith(2, 'advanced_duty_revision_slot_changes');
		expect(changeSetBuilder.insert).toHaveBeenCalledWith({
			id: 'change-set-1',
			organization_id: 'org-1',
			applied_run_id: 'run-1',
			reason: 'Coverage changed'
		});
		expect(slotBuilder.insert).toHaveBeenCalledWith([
			{
				id: 'slot-change-1',
				organization_id: 'org-1',
				change_set_id: 'change-set-1',
				event_date: '2026-05-02',
				slot_key: 'slot-nco:0'
			}
		]);
	});

	it('applies revision reapply through one RPC call', async () => {
		const rpc = vi.fn().mockResolvedValue({
			data: {
				changeSetRow: { id: 'change-set-1' },
				slotChangeRows: [{ id: 'slot-change-1' }],
				draftRow: { id: 'draft-1', status: 'applied' }
			},
			error: null
		});
		const adapter = createSupabaseAdvancedDutyPersistenceAdapter({ rpc } as unknown as SupabaseClient);

		const result = await adapter.applyAdvancedDutyRevision({
			orgId: 'org-1',
			draftId: 'draft-1',
			slotUpdateRows: [{ id: 'slot-1', duty_event_id: 'event-1', assignee_id: 'person-2' }],
			changeSetData: { id: 'change-set-1', organization_id: 'org-1' },
			slotChangeRows: [{ id: 'slot-change-1', organization_id: 'org-1' }],
			appliedDraftData: { id: 'draft-1', status: 'applied' },
			now: '2026-05-04T00:00:00.000Z'
		});

		expect(result).toEqual({
			changeSetRow: { id: 'change-set-1' },
			slotChangeRows: [{ id: 'slot-change-1' }],
			draftRow: { id: 'draft-1', status: 'applied' }
		});
		expect(rpc).toHaveBeenCalledWith('apply_advanced_duty_revision', {
			p_org_id: 'org-1',
			p_draft_id: 'draft-1',
			p_slot_updates: [{ id: 'slot-1', duty_event_id: 'event-1', assignee_id: 'person-2' }],
			p_change_set_data: { id: 'change-set-1', organization_id: 'org-1' },
			p_slot_change_rows: [{ id: 'slot-change-1', organization_id: 'org-1' }],
			p_applied_draft_data: { id: 'draft-1', status: 'applied' },
			p_now: '2026-05-04T00:00:00.000Z'
		});
	});

	it('deletes only selected temporary revision draft rows from the approved draft table', async () => {
		const builder = queryBuilder({ data: [{ id: 'draft-expired' }, { id: 'draft-discarded' }], error: null });
		const from = vi.fn().mockReturnValue(builder);
		const adapter = createSupabaseAdvancedDutyPersistenceAdapter({ from } as unknown as SupabaseClient);

		const result = await adapter.deleteAdvancedDutyRevisionDrafts({
			orgId: 'org-1',
			draftIds: ['draft-expired', 'draft-discarded']
		});

		expect(result).toBe(2);
		expect(from).toHaveBeenCalledWith('advanced_duty_revision_drafts');
		expect(builder.delete).toHaveBeenCalled();
		expect(builder.eq).toHaveBeenCalledWith('organization_id', 'org-1');
		expect(builder.in).toHaveBeenCalledWith('id', ['draft-expired', 'draft-discarded']);
		expect(builder.select).toHaveBeenCalledWith('id');
	});

	it('reads compact revision history rows from the approved history tables', async () => {
		const changeSetBuilder = queryBuilder({ data: [{ id: 'change-set-1' }], error: null });
		const slotBuilder = queryBuilder({ data: [{ id: 'slot-change-1' }], error: null });
		const from = vi.fn().mockReturnValueOnce(changeSetBuilder).mockReturnValueOnce(slotBuilder);
		const adapter = createSupabaseAdvancedDutyPersistenceAdapter({ from } as unknown as SupabaseClient);

		await expect(
			adapter.listAdvancedDutyRevisionChangeSets({ orgId: 'org-1', appliedRunIds: ['run-1'] })
		).resolves.toEqual([{ id: 'change-set-1' }]);
		await expect(
			adapter.listAdvancedDutyRevisionSlotChanges({ orgId: 'org-1', changeSetIds: ['change-set-1'] })
		).resolves.toEqual([{ id: 'slot-change-1' }]);

		expect(from).toHaveBeenNthCalledWith(1, 'advanced_duty_revision_change_sets');
		expect(from).toHaveBeenNthCalledWith(2, 'advanced_duty_revision_slot_changes');
		expect(changeSetBuilder.in).toHaveBeenCalledWith('applied_run_id', ['run-1']);
		expect(slotBuilder.in).toHaveBeenCalledWith('change_set_id', ['change-set-1']);
	});

	it('keeps only one active in-memory revision draft per applied run', async () => {
		const store = createInMemoryDataStore();
		const adapter = createInMemoryAdvancedDutyPersistenceAdapter(store);

		const first = await adapter.createAdvancedDutyRevisionDraft({
			orgId: 'org-1',
			draftData: {
				id: 'draft-1',
				applied_run_id: 'run-1',
				status: 'draft',
				slot_changes: [],
				draft_version: 1
			}
		});

		await expect(
			adapter.createAdvancedDutyRevisionDraft({
				orgId: 'org-1',
				draftData: {
					id: 'draft-2',
					applied_run_id: 'run-1',
					status: 'draft',
					slot_changes: [],
					draft_version: 1
				}
			})
		).rejects.toThrow('Active Advanced Duty revision draft already exists for applied run run-1');

		await adapter.updateAdvancedDutyRevisionDraft({
			orgId: 'org-1',
			draftId: String(first.id),
			draftData: { status: 'discarded' }
		});
		await expect(
			adapter.createAdvancedDutyRevisionDraft({
				orgId: 'org-1',
				draftData: {
					id: 'draft-2',
					applied_run_id: 'run-1',
					status: 'draft',
					slot_changes: [],
					draft_version: 1
				}
			})
		).resolves.toMatchObject({ id: 'draft-2' });
	});

	it('restores in-memory operational rows when revision reapply persistence fails mid-write', async () => {
		const store = createInMemoryDataStore();
		const adapter = createInMemoryAdvancedDutyPersistenceAdapter(store);
		store.seed('duty_events', [
			{
				id: 'event-1',
				organization_id: 'org-1',
				fill_summary: { totalSlots: 1, filledSlots: 1, unfilledSlots: 0 },
				updated_at: '2026-05-03T00:00:00.000Z'
			}
		]);
		store.seed('duty_event_slots', [
			{
				id: 'slot-1',
				organization_id: 'org-1',
				duty_event_id: 'event-1',
				assignee_id: 'person-1',
				assignment_source: 'generated',
				warning_state: 'none'
			}
		]);
		store.seed('advanced_duty_revision_drafts', [
			{
				id: 'draft-1',
				organization_id: 'org-1',
				applied_run_id: 'run-1',
				status: 'draft',
				slot_changes: [],
				draft_version: 1
			}
		]);
		const originalInsertMany: typeof store.insertMany = store.insertMany.bind(store);
		store.insertMany = vi.fn(
			async <T>(table: string, orgId: string, rows: Record<string, unknown>[], select?: string): Promise<T[]> => {
				if (table === 'advanced_duty_revision_slot_changes') {
					throw new Error('slot change insert failed');
				}
				return originalInsertMany<T>(table, orgId, rows, select);
			}
		) as typeof store.insertMany;

		await expect(
			adapter.applyAdvancedDutyRevision({
				orgId: 'org-1',
				draftId: 'draft-1',
				slotUpdateRows: [
					{
						id: 'slot-1',
						duty_event_id: 'event-1',
						assignee_id: 'person-2',
						assignment_source: 'manual',
						warning_state: 'none',
						selection_reason: 'Reapplied from Advanced Duty revision draft.',
						unfilled_reason: null
					}
				],
				changeSetData: { id: 'change-set-1', organization_id: 'org-1', applied_run_id: 'run-1', reason: 'Review' },
				slotChangeRows: [{ id: 'slot-change-1', organization_id: 'org-1', change_set_id: 'change-set-1' }],
				appliedDraftData: { id: 'draft-1', status: 'applied' },
				now: '2026-05-04T00:00:00.000Z'
			})
		).rejects.toThrow('slot change insert failed');

		await expect(store.findOne('duty_event_slots', 'org-1', { id: 'slot-1' })).resolves.toMatchObject({
			assignee_id: 'person-1',
			assignment_source: 'generated'
		});
		await expect(store.findOne('duty_events', 'org-1', { id: 'event-1' })).resolves.toMatchObject({
			fill_summary: { totalSlots: 1, filledSlots: 1, unfilledSlots: 0 },
			updated_at: '2026-05-03T00:00:00.000Z'
		});
		await expect(store.findMany('advanced_duty_revision_change_sets', 'org-1')).resolves.toHaveLength(0);
		await expect(store.findOne('advanced_duty_revision_drafts', 'org-1', { id: 'draft-1' })).resolves.toMatchObject({
			status: 'draft'
		});
	});
});
