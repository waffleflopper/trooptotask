import type { SupabaseClient } from '@supabase/supabase-js';
import type {
	AdvancedDutyPersistencePort,
	DataStore,
	PersistedDutyEventAggregate,
	PersistedDutyTemplateAggregate
} from '$lib/server/core/ports';

function cloneRow<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T;
}

function buildRpcError(rpcName: string, message: string): Error {
	return new Error(`${rpcName}: ${message}`);
}

function asTemplateAggregate(value: unknown): PersistedDutyTemplateAggregate {
	const aggregate = value as PersistedDutyTemplateAggregate | null;
	if (!aggregate?.templateRow || !Array.isArray(aggregate.slotRows) || !Array.isArray(aggregate.rotationBaselineRows)) {
		throw new Error('Advanced duty template aggregate RPC returned an invalid payload');
	}
	return aggregate;
}

function asEventAggregate(value: unknown): PersistedDutyEventAggregate {
	const aggregate = value as PersistedDutyEventAggregate | null;
	if (!aggregate?.eventRow || !Array.isArray(aggregate.slotRows)) {
		throw new Error('Advanced duty event aggregate RPC returned an invalid payload');
	}
	return aggregate;
}

export function createSupabaseAdvancedDutyPersistenceAdapter(supabase: SupabaseClient): AdvancedDutyPersistencePort {
	return {
		async updateDutyTemplateAggregate(input) {
			const rpcName = 'update_advanced_duty_template_aggregate';
			const { data, error } = await supabase.rpc('update_advanced_duty_template_aggregate', {
				p_org_id: input.orgId,
				p_template_id: input.templateId,
				p_template_data: input.templateData,
				p_slot_rows: input.slotRows,
				p_rotation_baseline_rows: input.rotationBaselineRows
			});

			if (error) {
				throw buildRpcError(rpcName, error.message);
			}

			return asTemplateAggregate(data);
		},

		async updateDutyEventAggregate(input) {
			const rpcName = 'update_advanced_duty_event_aggregate';
			const { data, error } = await supabase.rpc('update_advanced_duty_event_aggregate', {
				p_org_id: input.orgId,
				p_duty_event_id: input.dutyEventId,
				p_event_data: input.eventData,
				p_slot_rows: input.slotRows
			});

			if (error) {
				throw buildRpcError(rpcName, error.message);
			}

			return asEventAggregate(data);
		}
	};
}

export function createInMemoryAdvancedDutyPersistenceAdapter(store: DataStore): AdvancedDutyPersistencePort {
	return {
		async updateDutyTemplateAggregate(input) {
			const previousTemplateRow = cloneRow(
				await store.findOne<Record<string, unknown>>('duty_templates', input.orgId, { id: input.templateId })
			);
			if (!previousTemplateRow) {
				throw new Error(`Record not found: duty_templates/${input.templateId}`);
			}
			const previousSlotRows = cloneRow(
				await store.findMany<Record<string, unknown>>('duty_template_slots', input.orgId, {
					template_id: input.templateId
				})
			);
			const previousBaselineRows = cloneRow(
				await store.findMany<Record<string, unknown>>('duty_template_rotation_baselines', input.orgId, {
					template_id: input.templateId
				})
			);

			try {
				const templateRow = await store.update<Record<string, unknown>>(
					'duty_templates',
					input.orgId,
					input.templateId,
					input.templateData
				);
				await store.deleteWhere('duty_template_slots', input.orgId, { template_id: input.templateId });
				const slotRows = await store.insertMany<Record<string, unknown>>(
					'duty_template_slots',
					input.orgId,
					input.slotRows
				);
				await store.deleteWhere('duty_template_rotation_baselines', input.orgId, { template_id: input.templateId });
				const rotationBaselineRows = await store.insertMany<Record<string, unknown>>(
					'duty_template_rotation_baselines',
					input.orgId,
					input.rotationBaselineRows
				);

				return {
					templateRow,
					slotRows,
					rotationBaselineRows
				};
			} catch (error) {
				try {
					await store.update<Record<string, unknown>>(
						'duty_templates',
						input.orgId,
						input.templateId,
						previousTemplateRow
					);
					await store.deleteWhere('duty_template_slots', input.orgId, { template_id: input.templateId });
					if (previousSlotRows.length > 0) {
						await store.insertMany('duty_template_slots', input.orgId, previousSlotRows);
					}
					await store.deleteWhere('duty_template_rotation_baselines', input.orgId, { template_id: input.templateId });
					if (previousBaselineRows.length > 0) {
						await store.insertMany('duty_template_rotation_baselines', input.orgId, previousBaselineRows);
					}
				} catch (restoreError) {
					console.error('Failed to restore duty template after aggregate persistence error', restoreError);
				}

				throw error;
			}
		},

		async updateDutyEventAggregate(input) {
			const previousEventRow = cloneRow(
				await store.findOne<Record<string, unknown>>('duty_events', input.orgId, { id: input.dutyEventId })
			);
			if (!previousEventRow) {
				throw new Error(`Record not found: duty_events/${input.dutyEventId}`);
			}
			const previousSlotRows = cloneRow(
				await store.findMany<Record<string, unknown>>('duty_event_slots', input.orgId, {
					duty_event_id: input.dutyEventId
				})
			);

			try {
				const eventRow = await store.update<Record<string, unknown>>(
					'duty_events',
					input.orgId,
					input.dutyEventId,
					input.eventData
				);
				await store.deleteWhere('duty_event_slots', input.orgId, { duty_event_id: input.dutyEventId });
				const slotRows = await store.insertMany<Record<string, unknown>>(
					'duty_event_slots',
					input.orgId,
					input.slotRows
				);

				return {
					eventRow,
					slotRows
				};
			} catch (error) {
				try {
					await store.update<Record<string, unknown>>('duty_events', input.orgId, input.dutyEventId, previousEventRow);
					await store.deleteWhere('duty_event_slots', input.orgId, { duty_event_id: input.dutyEventId });
					if (previousSlotRows.length > 0) {
						await store.insertMany('duty_event_slots', input.orgId, previousSlotRows);
					}
				} catch (restoreError) {
					console.error('Failed to restore duty event after aggregate persistence error', restoreError);
				}

				throw error;
			}
		}
	};
}
