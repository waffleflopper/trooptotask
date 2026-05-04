import { z } from 'zod';
import { defineEntity, field } from '$lib/server/entitySchema';
import type {
	AdvancedDutyRevisionChangeSetRecord,
	AdvancedDutyRevisionDraftRecord,
	AdvancedDutyRevisionSlotChangeRecord
} from '$features/duty-roster/duty-roster.types';

const draftStatusSchema = z.enum(['draft', 'applied', 'discarded']);
const assignmentSourceSchema = z.enum(['generated', 'manual', 'locked']);
const warningStateSchema = z.enum(['none', 'warning', 'conflict']);
const changeIntentSchema = z.enum(['assign', 'clear', 'lock-assigned', 'lock-open']);
const objectPayloadSchema = z.record(z.string(), z.unknown());

export const AdvancedDutyRevisionDraftEntity = defineEntity<AdvancedDutyRevisionDraftRecord>({
	table: 'advanced_duty_revision_drafts',
	permission: 'calendar',
	groupScope: 'none',
	audit: { resourceType: 'advanced_duty_revision_draft', detailFields: ['appliedRunId', 'status'] },
	orderBy: [{ column: 'updated_at', ascending: false }],
	schema: {
		id: field(z.string(), { readOnly: true }),
		orgId: field(z.string(), { column: 'organization_id', readOnly: true }),
		appliedRunId: field(z.string(), { column: 'applied_run_id' }),
		sourceSnapshotId: field(z.string().nullable(), { column: 'source_snapshot_id', insertDefault: null }),
		sourceSnapshotFingerprint: field(z.string().nullable(), {
			column: 'source_snapshot_fingerprint',
			insertDefault: null
		}),
		sourceRunCreatedAt: field(z.string().nullable(), { column: 'source_run_created_at', insertDefault: null }),
		sourceRunUpdatedAt: field(z.string().nullable(), { column: 'source_run_updated_at', insertDefault: null }),
		status: field(draftStatusSchema, { insertDefault: 'draft' }),
		slotChanges: field(z.array(z.unknown()), { column: 'slot_changes', insertDefault: [], nullDefault: [] }),
		reason: field(z.string().nullable(), { insertDefault: null }),
		latestValidation: field(objectPayloadSchema.nullable(), {
			column: 'latest_validation',
			insertDefault: null
		}),
		latestError: field(z.string().nullable(), { column: 'latest_error', insertDefault: null }),
		conflictSummary: field(objectPayloadSchema.nullable(), { column: 'conflict_summary', insertDefault: null }),
		draftVersion: field(z.number().int().min(1), { column: 'draft_version', insertDefault: 1 }),
		createdByUserId: field(z.string().nullable(), { column: 'created_by_user_id', insertDefault: null }),
		updatedByUserId: field(z.string().nullable(), { column: 'updated_by_user_id', insertDefault: null }),
		appliedByUserId: field(z.string().nullable(), { column: 'applied_by_user_id', insertDefault: null }),
		discardedByUserId: field(z.string().nullable(), { column: 'discarded_by_user_id', insertDefault: null }),
		expiresAt: field(z.string(), { column: 'expires_at', readOnly: true }),
		discardCleanupAfter: field(z.string().nullable(), { column: 'discard_cleanup_after', insertDefault: null }),
		appliedAt: field(z.string().nullable(), { column: 'applied_at', insertDefault: null }),
		discardedAt: field(z.string().nullable(), { column: 'discarded_at', insertDefault: null }),
		createdAt: field(z.string(), { column: 'created_at', readOnly: true }),
		updatedAt: field(z.string(), { column: 'updated_at', readOnly: true })
	}
});

export const AdvancedDutyRevisionChangeSetEntity = defineEntity<AdvancedDutyRevisionChangeSetRecord>({
	table: 'advanced_duty_revision_change_sets',
	permission: 'calendar',
	groupScope: 'none',
	audit: { resourceType: 'advanced_duty_revision_change_set', detailFields: ['appliedRunId', 'reason'] },
	orderBy: [{ column: 'applied_at', ascending: false }],
	schema: {
		id: field(z.string(), { readOnly: true }),
		orgId: field(z.string(), { column: 'organization_id', readOnly: true }),
		appliedRunId: field(z.string(), { column: 'applied_run_id' }),
		sourceDraftId: field(z.string().nullable(), { column: 'source_draft_id', insertDefault: null }),
		sourceSnapshotId: field(z.string().nullable(), { column: 'source_snapshot_id', insertDefault: null }),
		sourceSnapshotFingerprint: field(z.string().nullable(), {
			column: 'source_snapshot_fingerprint',
			insertDefault: null
		}),
		reason: field(z.string().trim().min(1)),
		actorUserId: field(z.string().nullable(), { column: 'actor_user_id', insertDefault: null }),
		reviewableConflictsConfirmed: field(z.boolean(), {
			column: 'reviewable_conflicts_confirmed',
			insertDefault: false
		}),
		conflictSummary: field(objectPayloadSchema.nullable(), { column: 'conflict_summary', insertDefault: null }),
		warningSummary: field(objectPayloadSchema.nullable(), { column: 'warning_summary', insertDefault: null }),
		appliedAt: field(z.string(), { column: 'applied_at', readOnly: true }),
		createdAt: field(z.string(), { column: 'created_at', readOnly: true })
	}
});

export const AdvancedDutyRevisionSlotChangeEntity = defineEntity<AdvancedDutyRevisionSlotChangeRecord>({
	table: 'advanced_duty_revision_slot_changes',
	permission: 'calendar',
	groupScope: 'none',
	audit: { resourceType: 'advanced_duty_revision_slot_change', detailFields: ['changeSetId', 'slotKey'] },
	orderBy: [{ column: 'event_date', ascending: true }],
	schema: {
		id: field(z.string(), { readOnly: true }),
		orgId: field(z.string(), { column: 'organization_id', readOnly: true }),
		changeSetId: field(z.string(), { column: 'change_set_id' }),
		dutyEventId: field(z.string().nullable(), { column: 'duty_event_id', insertDefault: null }),
		eventDate: field(z.string(), { column: 'event_date' }),
		slotKey: field(z.string().min(1), { column: 'slot_key' }),
		templateSlotId: field(z.string().nullable(), { column: 'template_slot_id', insertDefault: null }),
		roleLabel: field(z.string().min(1), { column: 'role_label' }),
		slotIndex: field(z.number().int().min(0), { column: 'slot_index' }),
		previousPersonnelId: field(z.string().nullable(), {
			column: 'previous_personnel_id',
			insertDefault: null
		}),
		newPersonnelId: field(z.string().nullable(), { column: 'new_personnel_id', insertDefault: null }),
		previousPersonnelSnapshot: field(objectPayloadSchema.nullable(), {
			column: 'previous_personnel_snapshot',
			insertDefault: null
		}),
		newPersonnelSnapshot: field(objectPayloadSchema.nullable(), {
			column: 'new_personnel_snapshot',
			insertDefault: null
		}),
		previousAssignmentSource: field(assignmentSourceSchema.nullable(), {
			column: 'previous_assignment_source',
			insertDefault: null
		}),
		newAssignmentSource: field(assignmentSourceSchema.nullable(), {
			column: 'new_assignment_source',
			insertDefault: null
		}),
		previousWarningState: field(warningStateSchema.nullable(), {
			column: 'previous_warning_state',
			insertDefault: null
		}),
		newWarningState: field(warningStateSchema.nullable(), { column: 'new_warning_state', insertDefault: null }),
		changeIntent: field(changeIntentSchema, { column: 'change_intent' }),
		warningMetadata: field(objectPayloadSchema.nullable(), { column: 'warning_metadata', insertDefault: null }),
		conflictMetadata: field(objectPayloadSchema.nullable(), { column: 'conflict_metadata', insertDefault: null }),
		createdAt: field(z.string(), { column: 'created_at', readOnly: true })
	}
});
