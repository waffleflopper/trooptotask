import type { SupabaseClient } from '@supabase/supabase-js';
import type {
	AdvancedDutyRevisionChangeSetPersistenceResult,
	AdvancedDutyRevisionReapplyPersistenceResult,
	AdvancedDutyPersistencePort,
	DataStore,
	PersistedDutyEventAggregate,
	PersistedDutyTemplateAggregate
} from '$lib/server/core/ports';

const REVISION_DRAFTS_TABLE = 'advanced_duty_revision_drafts';
const REVISION_CHANGE_SETS_TABLE = 'advanced_duty_revision_change_sets';
const REVISION_SLOT_CHANGES_TABLE = 'advanced_duty_revision_slot_changes';

function cloneRow<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T;
}

function buildRpcError(rpcName: string, message: string): Error {
	return new Error(`${rpcName}: ${message}`);
}

function buildTableError(operation: string, message: string): Error {
	return new Error(`${operation}: ${message}`);
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

function asRow(value: unknown, rpcName: string): Record<string, unknown> {
	const row = value as Record<string, unknown> | null;
	if (!row || typeof row !== 'object' || Array.isArray(row)) {
		throw new Error(`${rpcName} returned an invalid row`);
	}
	return row;
}

function asReapplyResult(value: unknown, rpcName: string): AdvancedDutyRevisionReapplyPersistenceResult {
	const result = value as AdvancedDutyRevisionReapplyPersistenceResult | null;
	if (
		!result?.changeSetRow ||
		!Array.isArray(result.slotChangeRows) ||
		!result.draftRow ||
		typeof result.changeSetRow !== 'object' ||
		typeof result.draftRow !== 'object'
	) {
		throw new Error(`${rpcName} returned an invalid payload`);
	}
	return result;
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
		},

		async replaceDraftAdvancedRunSnapshot(input) {
			const rpcName = 'replace_advanced_duty_run_snapshot';
			const { data, error } = await supabase.rpc('replace_advanced_duty_run_snapshot', {
				p_org_id: input.orgId,
				p_draft_lineage_key: input.draftLineageKey,
				p_snapshot_data: input.snapshotData
			});

			if (error) {
				throw buildRpcError(rpcName, error.message);
			}

			return asRow(data, rpcName);
		},

		async findActiveAdvancedDutyRevisionDraft(input) {
			const operation = `${REVISION_DRAFTS_TABLE}.findActive`;
			const { data, error } = await supabase
				.from(REVISION_DRAFTS_TABLE)
				.select('*')
				.eq('organization_id', input.orgId)
				.eq('applied_run_id', input.appliedRunId)
				.eq('status', 'draft')
				.maybeSingle();

			if (error) {
				throw buildTableError(operation, error.message);
			}

			return (data as Record<string, unknown> | null) ?? null;
		},

		async findAdvancedDutyRevisionDraft(input) {
			const operation = `${REVISION_DRAFTS_TABLE}.find`;
			const { data, error } = await supabase
				.from(REVISION_DRAFTS_TABLE)
				.select('*')
				.eq('organization_id', input.orgId)
				.eq('id', input.draftId)
				.maybeSingle();

			if (error) {
				throw buildTableError(operation, error.message);
			}

			return (data as Record<string, unknown> | null) ?? null;
		},

		async listAdvancedDutyRevisionDrafts(input) {
			const operation = `${REVISION_DRAFTS_TABLE}.list`;
			let query = supabase.from(REVISION_DRAFTS_TABLE).select('*').eq('organization_id', input.orgId);
			if (input.appliedRunId) {
				query = query.eq('applied_run_id', input.appliedRunId);
			}

			const { data, error } = await query.order('updated_at', { ascending: false });
			if (error) {
				throw buildTableError(operation, error.message);
			}

			return (data as Record<string, unknown>[] | null) ?? [];
		},

		async createAdvancedDutyRevisionDraft(input) {
			const operation = `${REVISION_DRAFTS_TABLE}.insert`;
			const { data, error } = await supabase.from(REVISION_DRAFTS_TABLE).insert(input.draftData).select('*').single();

			if (error) {
				throw buildTableError(operation, error.message);
			}

			return asRow(data, operation);
		},

		async updateAdvancedDutyRevisionDraft(input) {
			const operation = `${REVISION_DRAFTS_TABLE}.update`;
			const { data, error } = await supabase
				.from(REVISION_DRAFTS_TABLE)
				.update(input.draftData)
				.eq('organization_id', input.orgId)
				.eq('id', input.draftId)
				.select('*')
				.single();

			if (error) {
				throw buildTableError(operation, error.message);
			}

			return asRow(data, operation);
		},

		async deleteAdvancedDutyRevisionDrafts(input) {
			if (input.draftIds.length === 0) return 0;
			const operation = `${REVISION_DRAFTS_TABLE}.delete`;
			const { data, error } = await supabase
				.from(REVISION_DRAFTS_TABLE)
				.delete()
				.eq('organization_id', input.orgId)
				.in('id', input.draftIds)
				.select('id');

			if (error) {
				throw buildTableError(operation, error.message);
			}

			return ((data as Record<string, unknown>[] | null) ?? []).length;
		},

		async appendAdvancedDutyRevisionChangeSet(input) {
			const changeSetOperation = `${REVISION_CHANGE_SETS_TABLE}.insert`;
			const { data: changeSetData, error: changeSetError } = await supabase
				.from(REVISION_CHANGE_SETS_TABLE)
				.insert(input.changeSetData)
				.select('*')
				.single();

			if (changeSetError) {
				throw buildTableError(changeSetOperation, changeSetError.message);
			}

			let slotChangeRows: Record<string, unknown>[] = [];
			if (input.slotChangeRows.length > 0) {
				const slotChangeOperation = `${REVISION_SLOT_CHANGES_TABLE}.insert`;
				const { data, error } = await supabase
					.from(REVISION_SLOT_CHANGES_TABLE)
					.insert(input.slotChangeRows)
					.select('*');

				if (error) {
					throw buildTableError(slotChangeOperation, error.message);
				}
				slotChangeRows = (data as Record<string, unknown>[] | null) ?? [];
			}

			return {
				changeSetRow: asRow(changeSetData, changeSetOperation),
				slotChangeRows
			};
		},

		async applyAdvancedDutyRevision(input) {
			const rpcName = 'apply_advanced_duty_revision';
			const { data, error } = await supabase.rpc('apply_advanced_duty_revision', {
				p_org_id: input.orgId,
				p_draft_id: input.draftId,
				p_slot_updates: input.slotUpdateRows,
				p_change_set_data: input.changeSetData,
				p_slot_change_rows: input.slotChangeRows,
				p_applied_draft_data: input.appliedDraftData,
				p_now: input.now
			});

			if (error) {
				throw buildRpcError(rpcName, error.message);
			}

			return asReapplyResult(data, rpcName);
		},

		async listAdvancedDutyRevisionChangeSets(input) {
			const operation = `${REVISION_CHANGE_SETS_TABLE}.list`;
			let query = supabase.from(REVISION_CHANGE_SETS_TABLE).select('*').eq('organization_id', input.orgId);
			if (input.appliedRunIds && input.appliedRunIds.length > 0) {
				query = query.in('applied_run_id', input.appliedRunIds);
			}
			const { data, error } = await query.order('applied_at', { ascending: false });
			if (error) {
				throw buildTableError(operation, error.message);
			}
			return (data as Record<string, unknown>[] | null) ?? [];
		},

		async listAdvancedDutyRevisionSlotChanges(input) {
			const operation = `${REVISION_SLOT_CHANGES_TABLE}.list`;
			let query = supabase.from(REVISION_SLOT_CHANGES_TABLE).select('*').eq('organization_id', input.orgId);
			if (input.changeSetIds && input.changeSetIds.length > 0) {
				query = query.in('change_set_id', input.changeSetIds);
			}
			const { data, error } = await query.order('event_date', { ascending: true }).order('slot_index', {
				ascending: true
			});
			if (error) {
				throw buildTableError(operation, error.message);
			}
			return (data as Record<string, unknown>[] | null) ?? [];
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
		},

		async replaceDraftAdvancedRunSnapshot(input) {
			await store.deleteWhere('advanced_duty_run_snapshots', input.orgId, {
				status: 'draft',
				draft_lineage_key: input.draftLineageKey
			});
			return store.insert<Record<string, unknown>>('advanced_duty_run_snapshots', input.orgId, input.snapshotData);
		},

		async findActiveAdvancedDutyRevisionDraft(input) {
			return store.findOne<Record<string, unknown>>(REVISION_DRAFTS_TABLE, input.orgId, {
				applied_run_id: input.appliedRunId,
				status: 'draft'
			});
		},

		async findAdvancedDutyRevisionDraft(input) {
			return store.findOne<Record<string, unknown>>(REVISION_DRAFTS_TABLE, input.orgId, {
				id: input.draftId
			});
		},

		async listAdvancedDutyRevisionDrafts(input) {
			return store.findMany<Record<string, unknown>>(
				REVISION_DRAFTS_TABLE,
				input.orgId,
				input.appliedRunId ? { applied_run_id: input.appliedRunId } : undefined,
				{
					orderBy: [{ column: 'updated_at', ascending: false }]
				}
			);
		},

		async createAdvancedDutyRevisionDraft(input) {
			if (input.draftData.status === 'draft') {
				const active = await store.findOne<Record<string, unknown>>(REVISION_DRAFTS_TABLE, input.orgId, {
					applied_run_id: input.draftData.applied_run_id,
					status: 'draft'
				});
				if (active) {
					throw new Error(
						`Active Advanced Duty revision draft already exists for applied run ${String(input.draftData.applied_run_id)}`
					);
				}
			}
			return store.insert<Record<string, unknown>>(REVISION_DRAFTS_TABLE, input.orgId, input.draftData);
		},

		async updateAdvancedDutyRevisionDraft(input) {
			return store.update<Record<string, unknown>>(REVISION_DRAFTS_TABLE, input.orgId, input.draftId, input.draftData);
		},

		async deleteAdvancedDutyRevisionDrafts(input) {
			return store.deleteManyByIds(REVISION_DRAFTS_TABLE, input.orgId, input.draftIds);
		},

		async appendAdvancedDutyRevisionChangeSet(input): Promise<AdvancedDutyRevisionChangeSetPersistenceResult> {
			const changeSetRow = await store.insert<Record<string, unknown>>(
				REVISION_CHANGE_SETS_TABLE,
				input.orgId,
				input.changeSetData
			);
			const slotChangeRows =
				input.slotChangeRows.length > 0
					? await store.insertMany<Record<string, unknown>>(
							REVISION_SLOT_CHANGES_TABLE,
							input.orgId,
							input.slotChangeRows
						)
					: [];

			return {
				changeSetRow,
				slotChangeRows
			};
		},

		async applyAdvancedDutyRevision(input): Promise<AdvancedDutyRevisionReapplyPersistenceResult> {
			const eventIds = [...new Set(input.slotUpdateRows.map((row) => String(row.duty_event_id)).filter(Boolean))];
			const slotIds = input.slotUpdateRows.map((row) => String(row.id));
			const previousSlotRows = cloneRow(
				await Promise.all(
					slotIds.map(async (slotId) => {
						const row = await store.findOne<Record<string, unknown>>('duty_event_slots', input.orgId, { id: slotId });
						if (!row) {
							throw new Error(`Record not found: duty_event_slots/${slotId}`);
						}
						return row;
					})
				)
			);
			const previousEventRows = cloneRow(
				await Promise.all(
					eventIds.map(async (eventId) => {
						const row = await store.findOne<Record<string, unknown>>('duty_events', input.orgId, { id: eventId });
						if (!row) {
							throw new Error(`Record not found: duty_events/${eventId}`);
						}
						return row;
					})
				)
			);
			const previousDraftRow = cloneRow(
				await store.findOne<Record<string, unknown>>(REVISION_DRAFTS_TABLE, input.orgId, { id: input.draftId })
			);
			if (!previousDraftRow) {
				throw new Error(`Record not found: ${REVISION_DRAFTS_TABLE}/${input.draftId}`);
			}
			let insertedChangeSetRow: Record<string, unknown> | null = null;
			let insertedSlotChangeRows: Record<string, unknown>[] = [];

			try {
				for (const slotUpdate of input.slotUpdateRows) {
					await store.update<Record<string, unknown>>('duty_event_slots', input.orgId, String(slotUpdate.id), {
						assignee_id: slotUpdate.assignee_id,
						assignment_source: slotUpdate.assignment_source,
						warning_state: slotUpdate.warning_state,
						selection_reason: slotUpdate.selection_reason,
						unfilled_reason: slotUpdate.unfilled_reason
					});
				}

				for (const eventId of eventIds) {
					const currentSlotRows = await store.findMany<Record<string, unknown>>('duty_event_slots', input.orgId, {
						duty_event_id: eventId
					});
					const totalSlots = currentSlotRows.length;
					const filledSlots = currentSlotRows.filter((row) => row.assignee_id).length;
					await store.update<Record<string, unknown>>('duty_events', input.orgId, eventId, {
						fill_summary: {
							totalSlots,
							filledSlots,
							unfilledSlots: totalSlots - filledSlots
						},
						updated_at: input.now
					});
				}

				insertedChangeSetRow = await store.insert<Record<string, unknown>>(
					REVISION_CHANGE_SETS_TABLE,
					input.orgId,
					input.changeSetData
				);
				insertedSlotChangeRows =
					input.slotChangeRows.length > 0
						? await store.insertMany<Record<string, unknown>>(
								REVISION_SLOT_CHANGES_TABLE,
								input.orgId,
								input.slotChangeRows
							)
						: [];
				const draftRow = await store.update<Record<string, unknown>>(
					REVISION_DRAFTS_TABLE,
					input.orgId,
					input.draftId,
					input.appliedDraftData
				);

				return {
					changeSetRow: insertedChangeSetRow,
					slotChangeRows: insertedSlotChangeRows,
					draftRow
				};
			} catch (error) {
				try {
					if (insertedSlotChangeRows.length > 0) {
						await store.deleteManyByIds(
							REVISION_SLOT_CHANGES_TABLE,
							input.orgId,
							insertedSlotChangeRows.map((row) => String(row.id))
						);
					}
					if (insertedChangeSetRow) {
						await store.delete(REVISION_CHANGE_SETS_TABLE, input.orgId, String(insertedChangeSetRow.id));
					}
					await store.update<Record<string, unknown>>(
						REVISION_DRAFTS_TABLE,
						input.orgId,
						input.draftId,
						previousDraftRow
					);
					for (const eventRow of previousEventRows) {
						await store.update<Record<string, unknown>>('duty_events', input.orgId, String(eventRow.id), eventRow);
					}
					for (const slotRow of previousSlotRows) {
						await store.update<Record<string, unknown>>('duty_event_slots', input.orgId, String(slotRow.id), slotRow);
					}
				} catch (restoreError) {
					console.error('Failed to restore Advanced Duty revision reapply after persistence error', restoreError);
				}

				throw error;
			}
		},

		async listAdvancedDutyRevisionChangeSets(input) {
			return store.findMany<Record<string, unknown>>(REVISION_CHANGE_SETS_TABLE, input.orgId, undefined, {
				inFilters:
					input.appliedRunIds && input.appliedRunIds.length > 0 ? { applied_run_id: input.appliedRunIds } : undefined,
				orderBy: [{ column: 'applied_at', ascending: false }]
			});
		},

		async listAdvancedDutyRevisionSlotChanges(input) {
			return store.findMany<Record<string, unknown>>(REVISION_SLOT_CHANGES_TABLE, input.orgId, undefined, {
				inFilters:
					input.changeSetIds && input.changeSetIds.length > 0 ? { change_set_id: input.changeSetIds } : undefined,
				orderBy: [
					{ column: 'event_date', ascending: true },
					{ column: 'slot_index', ascending: true }
				]
			});
		}
	};
}
