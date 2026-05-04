import type {
	AdvancedDutyRevisionChangeIntent,
	AdvancedDutyRevisionChangeSetRecord,
	AdvancedDutyRevisionDraftRecord,
	AdvancedDutyRevisionHistoryEntry,
	AdvancedDutyRevisionSlotChangeRecord,
	DutyEvent,
	DutyEventAssignmentSource,
	DutyEventPreview,
	DutyEventPreviewSlotInstance,
	DutyEventSlotOverrideInput,
	DutyEventWarningState
} from '../duty-roster.types';

export interface AdvancedDutyRevisionAppliedRun {
	id: string;
	orgId: string;
	sourceSnapshotId: string | null;
	sourceSnapshotFingerprint: string | null;
	createdAt: string;
	updatedAt: string;
}

export interface StartAdvancedDutyRevisionDraftInput {
	appliedRun: AdvancedDutyRevisionAppliedRun;
	existingDrafts: AdvancedDutyRevisionDraftRecord[];
	actorUserId: string;
	now: string;
	makeId: () => string;
}

export interface StartAdvancedDutyRevisionDraftResult {
	action: 'created' | 'reopened';
	draft: AdvancedDutyRevisionDraftRecord;
}

function addDays(timestamp: string, days: number): string {
	const value = new Date(timestamp);
	value.setUTCDate(value.getUTCDate() + days);
	return value.toISOString();
}

export interface AdvancedDutyRevisionPersonnelSnapshot {
	rank?: string;
	firstName?: string;
	lastName?: string;
	groupLabel?: string;
	[key: string]: unknown;
}

export interface AdvancedDutyRevisionDraftSlotChange {
	eventDate: string;
	slotKey: string;
	dutyEventId?: string | null;
	templateSlotId?: string | null;
	roleLabel?: string;
	slotIndex?: number;
	newPersonnelId?: string | null;
	assignmentSource?: DutyEventAssignmentSource | null;
	warningState?: DutyEventWarningState | null;
	changeIntent?: AdvancedDutyRevisionChangeIntent;
	warningMetadata?: Record<string, unknown> | null;
	conflictMetadata?: Record<string, unknown> | null;
}

export interface UpdateAdvancedDutyRevisionDraftSlotChangeInput {
	draft: AdvancedDutyRevisionDraftRecord;
	change: AdvancedDutyRevisionDraftSlotChange;
	actorUserId: string;
	now: string;
}

export interface UpdateAdvancedDutyRevisionDraftSlotChangesInput {
	draft: AdvancedDutyRevisionDraftRecord;
	changes: AdvancedDutyRevisionDraftSlotChange[];
	actorUserId: string;
	now: string;
}

export interface DiscardAdvancedDutyRevisionDraftInput {
	draft: AdvancedDutyRevisionDraftRecord;
	actorUserId: string;
	now: string;
}

export interface AdvancedDutyRevisionAppliedSlot {
	eventDate: string;
	slotKey: string;
	dutyEventId?: string | null;
	templateSlotId?: string | null;
	roleLabel?: string;
	slotIndex?: number;
	personnelId?: string | null;
	personnelSnapshot?: AdvancedDutyRevisionPersonnelSnapshot | null;
	assignmentSource?: DutyEventAssignmentSource | null;
	warningState?: DutyEventWarningState | null;
}

export interface DeriveAdvancedDutyRevisionChangeSetInput {
	draft: AdvancedDutyRevisionDraftRecord;
	appliedSlots: AdvancedDutyRevisionAppliedSlot[];
	personnelSnapshots: Record<string, AdvancedDutyRevisionPersonnelSnapshot>;
	reason: string;
	actorUserId: string;
	now: string;
	makeChangeSetId: () => string;
	makeSlotChangeId: () => string;
}

export interface DerivedAdvancedDutyRevisionChangeSet {
	changeSet: AdvancedDutyRevisionChangeSetRecord;
	slotChanges: AdvancedDutyRevisionSlotChangeRecord[];
}

export interface AdvancedDutyRevisionConflictFact {
	code: string;
	message: string;
}

export interface AdvancedDutyRevisionPersonnelFact {
	archived: boolean;
}

export interface ValidateAdvancedDutyRevisionReapplyInput {
	draft: AdvancedDutyRevisionDraftRecord;
	canReapply: boolean;
	readOnly: boolean;
	reason: string;
	reviewableConflictsConfirmed: boolean;
	appliedSlots: Array<Pick<AdvancedDutyRevisionAppliedSlot, 'eventDate' | 'slotKey'>>;
	personnel: Record<string, AdvancedDutyRevisionPersonnelFact | undefined>;
	hardConflictsBySlotKey?: Record<string, AdvancedDutyRevisionConflictFact[]>;
	reviewableConflictsBySlotKey?: Record<string, AdvancedDutyRevisionConflictFact[]>;
}

export interface AdvancedDutyRevisionValidationConflict extends AdvancedDutyRevisionConflictFact {
	eventDate?: string;
	slotKey?: string;
}

export interface AdvancedDutyRevisionReapplyValidation {
	canReapply: boolean;
	reasonRequired: boolean;
	requiresReviewableConflictConfirmation: boolean;
	hardConflicts: AdvancedDutyRevisionValidationConflict[];
	reviewableConflicts: AdvancedDutyRevisionValidationConflict[];
}

export interface BuildAdvancedDutyRevisionHistoryModelInput {
	changeSets: AdvancedDutyRevisionChangeSetRecord[];
	slotChanges: AdvancedDutyRevisionSlotChangeRecord[];
}

function slotIdentity(change: Pick<AdvancedDutyRevisionDraftSlotChange, 'eventDate' | 'slotKey'>): string {
	return `${change.eventDate}::${change.slotKey}`;
}

function draftSlotChanges(draft: AdvancedDutyRevisionDraftRecord): AdvancedDutyRevisionDraftSlotChange[] {
	return draft.slotChanges as AdvancedDutyRevisionDraftSlotChange[];
}

export function listAdvancedDutyRevisionDraftSlotChanges(
	draft: AdvancedDutyRevisionDraftRecord
): AdvancedDutyRevisionDraftSlotChange[] {
	return draftSlotChanges(draft);
}

export function buildAdvancedDutyRevisionSlotKey(
	slot: Pick<DutyEventPreviewSlotInstance, 'templateSlotId' | 'roleLabel' | 'slotIndex'>
): string {
	return `${slot.templateSlotId ?? slot.roleLabel}:${slot.slotIndex}`;
}

export function advancedDutyRevisionSlotIdentity(
	change: Pick<AdvancedDutyRevisionDraftSlotChange, 'eventDate' | 'slotKey'>
): string {
	return slotIdentity(change);
}

export function advancedDutyRevisionDraftSlotChangesToOverrides(
	draft: AdvancedDutyRevisionDraftRecord
): DutyEventSlotOverrideInput[] | undefined {
	const changes = draftSlotChanges(draft);
	if (changes.length === 0) return undefined;
	return changes.map((change) => ({
		templateSlotId: change.templateSlotId ?? null,
		slotIndex: change.slotIndex ?? 0,
		assigneeId: change.newPersonnelId ?? null,
		assignmentSource:
			change.assignmentSource === 'locked' ||
			change.changeIntent === 'lock-open' ||
			change.changeIntent === 'lock-assigned'
				? 'locked'
				: 'manual'
	}));
}

function findRevisionPreviewSlot(
	preview: DutyEventPreview,
	override: DutyEventSlotOverrideInput
): DutyEventPreviewSlotInstance | null {
	return (
		preview.slotInstances.find(
			(slot) =>
				slot.slotIndex === override.slotIndex &&
				(override.templateSlotId ? slot.templateSlotId === override.templateSlotId : true)
		) ?? null
	);
}

function revisionChangeIntentFromOverride(
	override: DutyEventSlotOverrideInput
): AdvancedDutyRevisionDraftSlotChange['changeIntent'] {
	if (override.assigneeId === null) {
		return override.assignmentSource === 'locked' ? 'lock-open' : 'clear';
	}
	return override.assignmentSource === 'locked' ? 'lock-assigned' : 'assign';
}

export function buildAdvancedDutyRevisionDraftChangeFromOverride(input: {
	event: DutyEvent;
	preview: DutyEventPreview;
	override: DutyEventSlotOverrideInput;
}): AdvancedDutyRevisionDraftSlotChange {
	const slot = findRevisionPreviewSlot(input.preview, input.override);
	return {
		eventDate: input.event.eventDate,
		slotKey: slot
			? buildAdvancedDutyRevisionSlotKey(slot)
			: `${input.override.templateSlotId ?? 'slot'}:${input.override.slotIndex}`,
		dutyEventId: input.event.id,
		templateSlotId: input.override.templateSlotId ?? slot?.templateSlotId ?? null,
		roleLabel: slot?.roleLabel,
		slotIndex: input.override.slotIndex,
		newPersonnelId: input.override.assigneeId,
		assignmentSource: input.override.assignmentSource ?? slot?.assignmentSource ?? 'manual',
		warningState: slot?.warningState ?? 'none',
		changeIntent: revisionChangeIntentFromOverride(input.override)
	};
}

function findAppliedSlot(
	appliedSlots: AdvancedDutyRevisionAppliedSlot[],
	change: Pick<AdvancedDutyRevisionDraftSlotChange, 'eventDate' | 'slotKey'>
): AdvancedDutyRevisionAppliedSlot | null {
	return appliedSlots.find((slot) => slotIdentity(slot) === slotIdentity(change)) ?? null;
}

function hasMeaningfulSlotChange(
	change: AdvancedDutyRevisionDraftSlotChange,
	applied: AdvancedDutyRevisionAppliedSlot
) {
	return (
		(change.newPersonnelId ?? null) !== (applied.personnelId ?? null) ||
		(change.assignmentSource ?? null) !== (applied.assignmentSource ?? null) ||
		change.changeIntent === 'clear' ||
		change.changeIntent === 'lock-open' ||
		change.changeIntent === 'lock-assigned'
	);
}

export function hasOperationalAdvancedDutyRevisionSlotChange(
	change: AdvancedDutyRevisionDraftSlotChange,
	applied: AdvancedDutyRevisionAppliedSlot
): boolean {
	return hasMeaningfulSlotChange(change, applied);
}

export function startAdvancedDutyRevisionDraft(
	input: StartAdvancedDutyRevisionDraftInput
): StartAdvancedDutyRevisionDraftResult {
	const activeDraft = input.existingDrafts.find(
		(draft) => draft.appliedRunId === input.appliedRun.id && draft.status === 'draft'
	);

	if (activeDraft) {
		return {
			action: 'reopened',
			draft: {
				...activeDraft,
				updatedByUserId: input.actorUserId,
				updatedAt: input.now
			}
		};
	}

	return {
		action: 'created',
		draft: {
			id: input.makeId(),
			orgId: input.appliedRun.orgId,
			appliedRunId: input.appliedRun.id,
			sourceSnapshotId: input.appliedRun.sourceSnapshotId,
			sourceSnapshotFingerprint: input.appliedRun.sourceSnapshotFingerprint,
			sourceRunCreatedAt: input.appliedRun.createdAt,
			sourceRunUpdatedAt: input.appliedRun.updatedAt,
			status: 'draft',
			slotChanges: [],
			reason: null,
			latestValidation: null,
			latestError: null,
			conflictSummary: null,
			draftVersion: 1,
			createdByUserId: input.actorUserId,
			updatedByUserId: input.actorUserId,
			appliedByUserId: null,
			discardedByUserId: null,
			expiresAt: addDays(input.now, 7),
			discardCleanupAfter: null,
			appliedAt: null,
			discardedAt: null,
			createdAt: input.now,
			updatedAt: input.now
		}
	};
}

export function updateAdvancedDutyRevisionDraftSlotChange(
	input: UpdateAdvancedDutyRevisionDraftSlotChangeInput
): AdvancedDutyRevisionDraftRecord {
	return updateAdvancedDutyRevisionDraftSlotChanges({
		...input,
		changes: [input.change]
	});
}

export function updateAdvancedDutyRevisionDraftSlotChanges(
	input: UpdateAdvancedDutyRevisionDraftSlotChangesInput
): AdvancedDutyRevisionDraftRecord {
	if (input.changes.length === 0) {
		return input.draft;
	}
	const currentChanges = draftSlotChanges(input.draft);
	const nextChanges = [...currentChanges];

	for (const incomingChange of input.changes) {
		const existingIndex = nextChanges.findIndex((change) => slotIdentity(change) === slotIdentity(incomingChange));
		if (existingIndex >= 0) {
			nextChanges[existingIndex] = incomingChange;
		} else {
			nextChanges.push(incomingChange);
		}
	}

	return {
		...input.draft,
		slotChanges: nextChanges,
		draftVersion: input.draft.draftVersion + 1,
		updatedByUserId: input.actorUserId,
		updatedAt: input.now
	};
}

export function discardAdvancedDutyRevisionDraft(
	input: DiscardAdvancedDutyRevisionDraftInput
): AdvancedDutyRevisionDraftRecord {
	return {
		...input.draft,
		status: 'discarded',
		updatedByUserId: input.actorUserId,
		discardedByUserId: input.actorUserId,
		discardedAt: input.now,
		discardCleanupAfter: addDays(input.now, 30),
		updatedAt: input.now
	};
}

export function deriveAdvancedDutyRevisionChangeSet(
	input: DeriveAdvancedDutyRevisionChangeSetInput
): DerivedAdvancedDutyRevisionChangeSet {
	const reason = input.reason.trim();

	if (!reason) {
		throw new Error('Advanced Duty revision reapply requires a reason.');
	}

	const changeSetId = input.makeChangeSetId();
	const slotChanges = draftSlotChanges(input.draft).flatMap((change) => {
		const applied = findAppliedSlot(input.appliedSlots, change);
		if (!applied || !hasMeaningfulSlotChange(change, applied)) return [];

		const newPersonnelSnapshot =
			change.newPersonnelId === null || change.newPersonnelId === undefined
				? null
				: (input.personnelSnapshots[change.newPersonnelId] ?? null);

		return [
			{
				id: input.makeSlotChangeId(),
				orgId: input.draft.orgId,
				changeSetId,
				dutyEventId: change.dutyEventId ?? applied.dutyEventId ?? null,
				eventDate: change.eventDate,
				slotKey: change.slotKey,
				templateSlotId: change.templateSlotId ?? applied.templateSlotId ?? null,
				roleLabel: change.roleLabel ?? applied.roleLabel ?? change.slotKey,
				slotIndex: change.slotIndex ?? applied.slotIndex ?? 0,
				previousPersonnelId: applied.personnelId ?? null,
				newPersonnelId: change.newPersonnelId ?? null,
				previousPersonnelSnapshot: applied.personnelSnapshot ?? null,
				newPersonnelSnapshot,
				previousAssignmentSource: applied.assignmentSource ?? null,
				newAssignmentSource: change.assignmentSource ?? null,
				previousWarningState: applied.warningState ?? null,
				newWarningState: change.warningState ?? null,
				changeIntent: change.changeIntent ?? 'assign',
				warningMetadata: change.warningMetadata ?? null,
				conflictMetadata: change.conflictMetadata ?? null,
				createdAt: input.now
			} satisfies AdvancedDutyRevisionSlotChangeRecord
		];
	});

	return {
		changeSet: {
			id: changeSetId,
			orgId: input.draft.orgId,
			appliedRunId: input.draft.appliedRunId,
			sourceDraftId: input.draft.id,
			sourceSnapshotId: input.draft.sourceSnapshotId,
			sourceSnapshotFingerprint: input.draft.sourceSnapshotFingerprint,
			reason,
			actorUserId: input.actorUserId,
			reviewableConflictsConfirmed: false,
			conflictSummary: null,
			warningSummary: null,
			appliedAt: input.now,
			createdAt: input.now
		},
		slotChanges
	};
}

export function validateAdvancedDutyRevisionReapply(
	input: ValidateAdvancedDutyRevisionReapplyInput
): AdvancedDutyRevisionReapplyValidation {
	const reasonRequired = input.reason.trim().length === 0;
	const hardConflicts: AdvancedDutyRevisionValidationConflict[] = [];
	const reviewableConflicts: AdvancedDutyRevisionValidationConflict[] = [];
	const appliedSlotKeys = new Set(input.appliedSlots.map(slotIdentity));

	if (!input.canReapply) {
		hardConflicts.push({ code: 'missing-permission', message: 'Actor no longer has permission to reapply this run.' });
	}

	if (input.readOnly) {
		hardConflicts.push({ code: 'read-only-mode', message: 'Organization is in Read-Only Mode.' });
	}

	for (const change of draftSlotChanges(input.draft)) {
		const key = slotIdentity(change);
		if (!appliedSlotKeys.has(key)) {
			hardConflicts.push({
				code: 'operational-record-missing',
				message: 'The applied duty slot no longer exists.',
				eventDate: change.eventDate,
				slotKey: change.slotKey
			});
		}

		if (change.newPersonnelId) {
			const personnel = input.personnel[change.newPersonnelId];
			if (!personnel) {
				hardConflicts.push({
					code: 'missing-soldier',
					message: 'Selected Soldier is no longer available in this Organization.',
					eventDate: change.eventDate,
					slotKey: change.slotKey
				});
			} else if (personnel.archived) {
				hardConflicts.push({
					code: 'archived-soldier',
					message: 'Selected Soldier is archived.',
					eventDate: change.eventDate,
					slotKey: change.slotKey
				});
			}
		}

		for (const conflict of input.hardConflictsBySlotKey?.[key] ?? []) {
			hardConflicts.push({ ...conflict, eventDate: change.eventDate, slotKey: change.slotKey });
		}

		for (const conflict of input.reviewableConflictsBySlotKey?.[key] ?? []) {
			reviewableConflicts.push({ ...conflict, eventDate: change.eventDate, slotKey: change.slotKey });
		}
	}

	const requiresReviewableConflictConfirmation = reviewableConflicts.length > 0 && !input.reviewableConflictsConfirmed;

	return {
		canReapply: hardConflicts.length === 0 && !reasonRequired && !requiresReviewableConflictConfirmation,
		reasonRequired,
		requiresReviewableConflictConfirmation,
		hardConflicts,
		reviewableConflicts
	};
}

export function buildAdvancedDutyRevisionHistoryModel(
	input: BuildAdvancedDutyRevisionHistoryModelInput
): AdvancedDutyRevisionHistoryEntry[] {
	return input.changeSets.map((changeSet) => {
		const changes = input.slotChanges.filter((slotChange) => slotChange.changeSetId === changeSet.id);
		return {
			id: changeSet.id,
			appliedRunId: changeSet.appliedRunId,
			appliedAt: changeSet.appliedAt,
			actorUserId: changeSet.actorUserId,
			actorLabel: 'Actor unavailable',
			reason: changeSet.reason,
			changeCount: changes.length,
			changes
		};
	});
}
