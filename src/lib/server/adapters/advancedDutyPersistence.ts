import type { SupabaseClient } from '@supabase/supabase-js';
import type { AdvancedDutyPersistencePort, DataStore, PersistedDutyTemplateAggregate } from '$lib/server/core/ports';

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
		}
	};
}
