import type { AdvancedDutyPersistencePort, QueryPorts, WritePorts } from '$lib/server/core/ports';
import { fail } from '$lib/server/core/errors';
import {
	AdvancedDutyRevisionChangeSetEntity,
	AdvancedDutyRevisionDraftEntity,
	AdvancedDutyRevisionSlotChangeEntity
} from '$lib/server/entities/advancedDutyRevision';
import type {
	AdvancedDutyRevisionChangeSetRecord,
	AdvancedDutyRevisionDraftRecord,
	AdvancedDutyRevisionSlotChangeRecord
} from '$features/duty-roster/duty-roster.types';
import {
	discardAdvancedDutyRevisionDraft,
	startAdvancedDutyRevisionDraft,
	updateAdvancedDutyRevisionDraftSlotChange,
	type AdvancedDutyRevisionAppliedRun,
	type AdvancedDutyRevisionDraftSlotChange,
	type DerivedAdvancedDutyRevisionChangeSet,
	type StartAdvancedDutyRevisionDraftResult
} from '$features/duty-roster/advanced-run/advancedDutyRevision';
import { requireAdvancedDutyAccess } from './advancedDutyAccess';

type AdvancedDutyRevisionQueryContext = QueryPorts & {
	advancedDutyPersistence: AdvancedDutyPersistencePort;
};

type AdvancedDutyRevisionWriteContext = WritePorts & {
	advancedDutyPersistence: AdvancedDutyPersistencePort;
};

export interface CreateOrReopenAdvancedDutyRevisionDraftInput {
	appliedRun: AdvancedDutyRevisionAppliedRun;
	now?: string;
	makeId?: () => string;
}

export interface UpdateAdvancedDutyRevisionDraftChangeInput {
	draftId: string;
	change: AdvancedDutyRevisionDraftSlotChange;
	now?: string;
}

export interface DiscardAdvancedDutyRevisionDraftByIdInput {
	draftId: string;
	now?: string;
}

export interface AdvancedDutyRevisionDraftLookupInput {
	appliedRunId: string;
}

export interface AdvancedDutyRevisionChangeSetPersistenceResult {
	changeSet: AdvancedDutyRevisionChangeSetRecord;
	slotChanges: AdvancedDutyRevisionSlotChangeRecord[];
}

function requireActorUserId(ctx: Pick<AdvancedDutyRevisionWriteContext, 'auth'>): string {
	if (!ctx.auth.userId) {
		fail(401, 'Sign in before editing Advanced Duty revision drafts.');
	}
	return ctx.auth.userId;
}

async function requireWritableAdvancedDuty(ctx: AdvancedDutyRevisionWriteContext): Promise<string> {
	requireAdvancedDutyAccess(ctx.auth);
	const isReadOnly = await ctx.readOnlyGuard.check();
	if (isReadOnly) {
		fail(403, 'Organization is in read-only mode');
	}
	return requireActorUserId(ctx);
}

function assertAppliedRunBelongsToOrg(
	ctx: AdvancedDutyRevisionWriteContext,
	appliedRun: AdvancedDutyRevisionAppliedRun
): void {
	if (appliedRun.orgId !== ctx.auth.orgId) {
		fail(400, 'Advanced Duty revision draft does not belong to this Organization.');
	}
}

function draftToDbRow(draft: AdvancedDutyRevisionDraftRecord): Record<string, unknown> {
	return {
		id: draft.id,
		organization_id: draft.orgId,
		applied_run_id: draft.appliedRunId,
		source_snapshot_id: draft.sourceSnapshotId,
		source_snapshot_fingerprint: draft.sourceSnapshotFingerprint,
		source_run_created_at: draft.sourceRunCreatedAt,
		source_run_updated_at: draft.sourceRunUpdatedAt,
		status: draft.status,
		slot_changes: draft.slotChanges,
		reason: draft.reason,
		latest_validation: draft.latestValidation,
		latest_error: draft.latestError,
		conflict_summary: draft.conflictSummary,
		draft_version: draft.draftVersion,
		created_by_user_id: draft.createdByUserId,
		updated_by_user_id: draft.updatedByUserId,
		applied_by_user_id: draft.appliedByUserId,
		discarded_by_user_id: draft.discardedByUserId,
		expires_at: draft.expiresAt,
		discard_cleanup_after: draft.discardCleanupAfter,
		applied_at: draft.appliedAt,
		discarded_at: draft.discardedAt,
		created_at: draft.createdAt,
		updated_at: draft.updatedAt
	};
}

function changeSetToDbRow(changeSet: AdvancedDutyRevisionChangeSetRecord): Record<string, unknown> {
	return {
		id: changeSet.id,
		organization_id: changeSet.orgId,
		applied_run_id: changeSet.appliedRunId,
		source_draft_id: changeSet.sourceDraftId,
		source_snapshot_id: changeSet.sourceSnapshotId,
		source_snapshot_fingerprint: changeSet.sourceSnapshotFingerprint,
		reason: changeSet.reason,
		actor_user_id: changeSet.actorUserId,
		reviewable_conflicts_confirmed: changeSet.reviewableConflictsConfirmed,
		conflict_summary: changeSet.conflictSummary,
		warning_summary: changeSet.warningSummary,
		applied_at: changeSet.appliedAt,
		created_at: changeSet.createdAt
	};
}

function slotChangeToDbRow(slotChange: AdvancedDutyRevisionSlotChangeRecord): Record<string, unknown> {
	return {
		id: slotChange.id,
		organization_id: slotChange.orgId,
		change_set_id: slotChange.changeSetId,
		duty_event_id: slotChange.dutyEventId,
		event_date: slotChange.eventDate,
		slot_key: slotChange.slotKey,
		template_slot_id: slotChange.templateSlotId,
		role_label: slotChange.roleLabel,
		slot_index: slotChange.slotIndex,
		previous_personnel_id: slotChange.previousPersonnelId,
		new_personnel_id: slotChange.newPersonnelId,
		previous_personnel_snapshot: slotChange.previousPersonnelSnapshot,
		new_personnel_snapshot: slotChange.newPersonnelSnapshot,
		previous_assignment_source: slotChange.previousAssignmentSource,
		new_assignment_source: slotChange.newAssignmentSource,
		previous_warning_state: slotChange.previousWarningState,
		new_warning_state: slotChange.newWarningState,
		change_intent: slotChange.changeIntent,
		warning_metadata: slotChange.warningMetadata,
		conflict_metadata: slotChange.conflictMetadata,
		created_at: slotChange.createdAt
	};
}

async function loadRevisionDraftOrFail(
	ctx: AdvancedDutyRevisionQueryContext,
	draftId: string
): Promise<AdvancedDutyRevisionDraftRecord> {
	const row = await ctx.advancedDutyPersistence.findAdvancedDutyRevisionDraft({
		orgId: ctx.auth.orgId,
		draftId
	});
	if (!row) {
		fail(404, 'Advanced Duty revision draft not found.');
	}
	return AdvancedDutyRevisionDraftEntity.fromDb(row);
}

export async function createOrReopenAdvancedDutyRevisionDraft(
	ctx: AdvancedDutyRevisionWriteContext,
	input: CreateOrReopenAdvancedDutyRevisionDraftInput
): Promise<StartAdvancedDutyRevisionDraftResult> {
	const actorUserId = await requireWritableAdvancedDuty(ctx);
	assertAppliedRunBelongsToOrg(ctx, input.appliedRun);
	const now = input.now ?? new Date().toISOString();
	const activeDraft = await getActiveAdvancedDutyRevisionDraft(ctx, { appliedRunId: input.appliedRun.id });
	const result = startAdvancedDutyRevisionDraft({
		appliedRun: input.appliedRun,
		existingDrafts: activeDraft ? [activeDraft] : [],
		actorUserId,
		now,
		makeId: input.makeId ?? (() => crypto.randomUUID())
	});

	const persisted =
		result.action === 'created'
			? await ctx.advancedDutyPersistence.createAdvancedDutyRevisionDraft({
					orgId: ctx.auth.orgId,
					draftData: draftToDbRow(result.draft)
				})
			: await ctx.advancedDutyPersistence.updateAdvancedDutyRevisionDraft({
					orgId: ctx.auth.orgId,
					draftId: result.draft.id,
					draftData: draftToDbRow(result.draft)
				});

	ctx.audit.log({
		action:
			result.action === 'created' ? 'advanced-duty-revision-draft.created' : 'advanced-duty-revision-draft.reopened',
		resourceType: 'advanced_duty_revision_draft',
		resourceId: String(persisted.id),
		details: { appliedRunId: input.appliedRun.id }
	});

	return {
		action: result.action,
		draft: AdvancedDutyRevisionDraftEntity.fromDb(persisted)
	};
}

export async function getActiveAdvancedDutyRevisionDraft(
	ctx: AdvancedDutyRevisionQueryContext,
	input: AdvancedDutyRevisionDraftLookupInput
): Promise<AdvancedDutyRevisionDraftRecord | null> {
	requireAdvancedDutyAccess(ctx.auth);
	const row = await ctx.advancedDutyPersistence.findActiveAdvancedDutyRevisionDraft({
		orgId: ctx.auth.orgId,
		appliedRunId: input.appliedRunId
	});
	return row ? AdvancedDutyRevisionDraftEntity.fromDb(row) : null;
}

export async function listAdvancedDutyRevisionDrafts(
	ctx: AdvancedDutyRevisionQueryContext,
	input: { appliedRunId?: string } = {}
): Promise<AdvancedDutyRevisionDraftRecord[]> {
	requireAdvancedDutyAccess(ctx.auth);
	const rows = await ctx.advancedDutyPersistence.listAdvancedDutyRevisionDrafts({
		orgId: ctx.auth.orgId,
		appliedRunId: input.appliedRunId
	});
	return AdvancedDutyRevisionDraftEntity.fromDbArray(rows);
}

export async function updateAdvancedDutyRevisionDraftChange(
	ctx: AdvancedDutyRevisionWriteContext,
	input: UpdateAdvancedDutyRevisionDraftChangeInput
): Promise<AdvancedDutyRevisionDraftRecord> {
	const actorUserId = await requireWritableAdvancedDuty(ctx);
	const draft = await loadRevisionDraftOrFail(ctx, input.draftId);
	if (draft.status !== 'draft') {
		fail(409, 'Only active Advanced Duty revision drafts can be updated.');
	}
	const updatedDraft = updateAdvancedDutyRevisionDraftSlotChange({
		draft,
		change: input.change,
		actorUserId,
		now: input.now ?? new Date().toISOString()
	});
	const row = await ctx.advancedDutyPersistence.updateAdvancedDutyRevisionDraft({
		orgId: ctx.auth.orgId,
		draftId: input.draftId,
		draftData: draftToDbRow(updatedDraft)
	});
	ctx.audit.log({
		action: 'advanced-duty-revision-draft.updated',
		resourceType: 'advanced_duty_revision_draft',
		resourceId: input.draftId,
		details: { appliedRunId: updatedDraft.appliedRunId }
	});
	return AdvancedDutyRevisionDraftEntity.fromDb(row);
}

export async function discardAdvancedDutyRevisionDraftById(
	ctx: AdvancedDutyRevisionWriteContext,
	input: DiscardAdvancedDutyRevisionDraftByIdInput
): Promise<AdvancedDutyRevisionDraftRecord> {
	const actorUserId = await requireWritableAdvancedDuty(ctx);
	const draft = await loadRevisionDraftOrFail(ctx, input.draftId);
	if (draft.status !== 'draft') {
		return draft;
	}
	const discardedDraft = discardAdvancedDutyRevisionDraft({
		draft,
		actorUserId,
		now: input.now ?? new Date().toISOString()
	});
	const row = await ctx.advancedDutyPersistence.updateAdvancedDutyRevisionDraft({
		orgId: ctx.auth.orgId,
		draftId: input.draftId,
		draftData: draftToDbRow(discardedDraft)
	});
	ctx.audit.log({
		action: 'advanced-duty-revision-draft.discarded',
		resourceType: 'advanced_duty_revision_draft',
		resourceId: input.draftId,
		details: { appliedRunId: discardedDraft.appliedRunId }
	});
	return AdvancedDutyRevisionDraftEntity.fromDb(row);
}

export async function appendAdvancedDutyRevisionChangeSet(
	ctx: AdvancedDutyRevisionWriteContext,
	input: DerivedAdvancedDutyRevisionChangeSet
): Promise<AdvancedDutyRevisionChangeSetPersistenceResult> {
	await requireWritableAdvancedDuty(ctx);
	const result = await ctx.advancedDutyPersistence.appendAdvancedDutyRevisionChangeSet({
		orgId: ctx.auth.orgId,
		changeSetData: changeSetToDbRow(input.changeSet),
		slotChangeRows: input.slotChanges.map(slotChangeToDbRow)
	});
	ctx.audit.log({
		action: 'advanced-duty-revision-change-set.created',
		resourceType: 'advanced_duty_revision_change_set',
		resourceId: String(result.changeSetRow.id),
		details: {
			appliedRunId: input.changeSet.appliedRunId,
			slotChangeCount: input.slotChanges.length
		}
	});
	return {
		changeSet: AdvancedDutyRevisionChangeSetEntity.fromDb(result.changeSetRow),
		slotChanges: AdvancedDutyRevisionSlotChangeEntity.fromDbArray(result.slotChangeRows)
	};
}
