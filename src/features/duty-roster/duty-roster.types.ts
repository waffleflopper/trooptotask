export type DutyTemplateMode = 'simple' | 'advanced';
export type DutyTemplateStatus = 'draft' | 'active' | 'archived';
export type DutyTemplateScopeType = 'organization' | 'groups';
export type DutyTemplateCoverageMode = 'all-day' | 'timed';
export type DutyTemplateSlotBlockingMode = 'inherit' | 'blocking' | 'non-blocking';
export type SoftPreferenceType =
	| 'longest-break'
	| 'separate-weekend-da6'
	| 'include-holiday-donsa-da6'
	| 'holiday-closure'
	| 'weekend'
	| 'preferred-group';
export type DutyEventSeriesPattern =
	| 'daily'
	| 'weekday-only'
	| 'weekend-only'
	| 'selected-weekdays'
	| 'holiday-closure-only'
	| 'custom-dates';
export type DutyEventRunPattern = DutyEventSeriesPattern | 'single';

export interface SoftPreferenceConfig {
	type: SoftPreferenceType;
	enabled: boolean;
}

export const DEFAULT_SOFT_PREFERENCE_CONFIG = [
	{ type: 'longest-break', enabled: true },
	{ type: 'separate-weekend-da6', enabled: false },
	{ type: 'include-holiday-donsa-da6', enabled: false }
] as const satisfies readonly SoftPreferenceConfig[];

export const DEFAULT_SOFT_PREFERENCE_ORDER = DEFAULT_SOFT_PREFERENCE_CONFIG.map((preference) => preference.type) as [
	'longest-break',
	'separate-weekend-da6',
	'include-holiday-donsa-da6'
];

export const PERSISTED_SOFT_PREFERENCE_TYPES = [
	...DEFAULT_SOFT_PREFERENCE_ORDER,
	'holiday-closure',
	'weekend',
	'preferred-group'
] as const satisfies readonly SoftPreferenceType[];

export function cloneDefaultSoftPreferences(): SoftPreferenceConfig[] {
	return DEFAULT_SOFT_PREFERENCE_CONFIG.map((preference) => ({ ...preference }));
}

export interface DutyTemplateSlot {
	id: string;
	templateId: string;
	roleLabel: string;
	quantity: number;
	allowedRanks: string[];
	allowedGroupIds: string[];
	preferredGroupIds: string[];
	allowedMosValues: string[];
	allowedRoleValues: string[];
	rotationPoolKey: string;
	blockingMode?: DutyTemplateSlotBlockingMode;
	sortOrder: number;
}

export interface DutyTemplateRotationBaseline {
	id: string;
	templateId: string;
	rotationPoolKey: string;
	personId: string;
	lastServedDate: string;
}

export interface DutyTemplateRecord {
	id: string;
	orgId: string;
	mode: DutyTemplateMode;
	status: DutyTemplateStatus;
	name: string;
	description: string | null;
	scopeType: DutyTemplateScopeType;
	scopeGroupIds: string[];
	exemptPersonnelIds: string[];
	exemptStatusTypeIds?: string[];
	coverageMode: DutyTemplateCoverageMode;
	startTime: string | null;
	endTime: string | null;
	spansMidnight: boolean;
	isBlocking: boolean;
	cooldownHours: number;
	softPreferences: SoftPreferenceConfig[];
	createdAt: string;
	updatedAt: string;
}

export interface DutyTemplate extends DutyTemplateRecord {
	slots: DutyTemplateSlot[];
	rotationBaselines: DutyTemplateRotationBaseline[];
}

export interface DutyTemplateSlotInput {
	id?: string;
	roleLabel: string;
	quantity: number;
	allowedRanks?: string[];
	allowedGroupIds?: string[];
	preferredGroupIds?: string[];
	allowedMosValues?: string[];
	allowedRoleValues?: string[];
	rotationPoolKey?: string;
	blockingMode?: DutyTemplateSlotBlockingMode;
	sortOrder?: number;
}

export interface DutyTemplateRotationBaselineInput {
	rotationPoolKey: string;
	personId: string;
	lastServedDate: string;
}

export interface DutyTemplateWriteInput {
	id?: string;
	mode?: DutyTemplateMode;
	status: DutyTemplateStatus;
	name: string;
	description?: string | null;
	scopeType?: DutyTemplateScopeType;
	scopeGroupIds?: string[];
	exemptPersonnelIds?: string[];
	exemptStatusTypeIds?: string[];
	coverageMode?: DutyTemplateCoverageMode;
	startTime?: string | null;
	endTime?: string | null;
	spansMidnight?: boolean;
	isBlocking?: boolean;
	cooldownHours?: number;
	softPreferences?: SoftPreferenceConfig[];
	slots?: DutyTemplateSlotInput[];
	rotationBaselines?: DutyTemplateRotationBaselineInput[];
}

export interface DutyEventRulesSnapshot {
	templateId: string;
	templateName: string;
	templateStatus: DutyTemplateStatus;
	coverageMode: DutyTemplateCoverageMode;
	startTime: string | null;
	endTime: string | null;
	spansMidnight?: boolean;
	scopeType: DutyTemplateScopeType;
	scopeGroupIds: string[];
	exemptPersonnelIds?: string[];
	exemptStatusTypeIds?: string[];
	isBlocking: boolean;
	cooldownHours: number;
	softPreferences?: SoftPreferenceConfig[];
	rotationBaselines?: Array<{
		rotationPoolKey: string;
		personId: string;
		lastServedDate: string;
	}>;
	slots: Array<{
		templateSlotId: string;
		roleLabel: string;
		quantity: number;
		allowedRanks: string[];
		allowedGroupIds: string[];
		preferredGroupIds: string[];
		allowedMosValues: string[];
		allowedRoleValues: string[];
		rotationPoolKey: string;
		blockingMode?: DutyTemplateSlotBlockingMode;
		sortOrder: number;
	}>;
}

export interface DutyEventFillSummary {
	totalSlots: number;
	filledSlots: number;
	unfilledSlots: number;
}

export interface DutyEventCollisionSummary {
	hasConflicts: boolean;
	conflicts: string[];
}

export type DutyEventAssignmentSource = 'generated' | 'manual' | 'locked';
export type DutyEventWarningState = 'none' | 'warning' | 'conflict';
export type DutyEventPersistedFairnessConfidence = 'high' | 'low';
export type DutyEventFairnessConfidence = 'high' | 'medium' | 'low';

export interface DutyEventOriginalProposal {
	fillSummary: DutyEventFillSummary;
	collisionSummary: DutyEventCollisionSummary;
	slotInstances: DutyEventPreviewSlotInstance[];
}

export interface DutyEventSlotInstance {
	id: string;
	dutyEventId: string;
	templateSlotId: string | null;
	roleLabel: string;
	slotIndex: number;
	assigneeId: string | null;
	assignmentSource: DutyEventAssignmentSource;
	warningState: DutyEventWarningState;
	fairnessConfidence: DutyEventPersistedFairnessConfidence;
	selectionReason: string | null;
	unfilledReason: string | null;
	sortOrder: number;
}

export interface DutyEventPreviewSlotInstance {
	templateSlotId: string | null;
	roleLabel: string;
	slotIndex: number;
	assigneeId: string | null;
	assignmentSource: DutyEventAssignmentSource;
	warningState: DutyEventWarningState;
	fairnessConfidence: DutyEventFairnessConfidence;
	selectionReason: string | null;
	unfilledReason: string | null;
	overrideMessages?: string[];
	candidateRankings?: DutyEventSlotCandidateRanking[];
	sortOrder: number;
}

export interface DutyEventSlotCandidateRanking {
	personnelId: string;
	rank: number;
}

export type AdvancedDutyDa6CellCode =
	| 'assigned'
	| 'available-not-selected'
	| 'authorized-absence'
	| 'blocked-by-duty'
	| 'blocked-by-cooldown'
	| 'misconduct-unavailable';

export type AdvancedDutyDa6SequenceKey = 'single' | 'weekday' | 'weekend-holiday';

export interface AdvancedDutyDa6MatrixColumn {
	eventDate: string;
	coverageStart: string;
	coverageEnd: string;
	sequenceKey: AdvancedDutyDa6SequenceKey;
	sequenceLabel: string;
	chargeSequenceStart: number | null;
	chargeableCount: number;
}

export interface AdvancedDutyDa6MatrixCell {
	eventDate: string;
	personnelId: string;
	code: AdvancedDutyDa6CellCode;
	da6Code: 'A' | 'D' | 'U' | null;
	chargeable: boolean;
	queuePosition: number | null;
	sequenceNumber: number | null;
	assigned: boolean;
	reason: string | null;
	reasonCode: string | null;
}

export interface AdvancedDutyDa6MatrixRow {
	personnelId: string;
	display: {
		id: string;
		rank: string;
		firstName: string;
		lastName: string;
		groupName: string;
	};
	cells: AdvancedDutyDa6MatrixCell[];
}

export interface AdvancedDutyDa6Matrix {
	templateSlotId: string;
	roleLabel: string;
	rotationPoolKey: string;
	sequenceKey: AdvancedDutyDa6SequenceKey;
	sequenceLabel: string;
	numberingMode: 'single-sequence' | 'separate-weekend-holiday';
	columns: AdvancedDutyDa6MatrixColumn[];
	rows: AdvancedDutyDa6MatrixRow[];
}

export interface DutyEventRecord {
	id: string;
	orgId: string;
	runId: string | null;
	templateId: string;
	templateName: string;
	eventDate: string;
	coverageMode: DutyTemplateCoverageMode;
	coverageStart: string;
	coverageEnd: string;
	isBlocking: boolean;
	cooldownHours: number;
	rulesSnapshot: DutyEventRulesSnapshot;
	fillSummary: DutyEventFillSummary;
	collisionSummary: DutyEventCollisionSummary;
	originalProposal: DutyEventOriginalProposal | null;
	createdAt: string;
	updatedAt: string;
}

export interface DutyEvent extends DutyEventRecord {
	slotInstances: DutyEventSlotInstance[];
	run?: DutyEventRunRecord | null;
}

export interface DutyEventRunRecord {
	id: string;
	orgId: string;
	templateId: string | null;
	templateName: string;
	pattern: DutyEventRunPattern;
	startDate: string;
	endDate: string;
	eventCount: number;
	isLegacy: boolean;
	createdAt: string;
	updatedAt: string;
}

export type AdvancedDutyRunSnapshotStatus =
	| 'draft'
	| 'applying'
	| 'applied'
	| 'apply-failed'
	| 'partial-failure'
	| 'expired';

export const RESUMABLE_ADVANCED_DUTY_RUN_SNAPSHOT_STATUSES = [
	'draft',
	'applying',
	'apply-failed',
	'partial-failure'
] as const satisfies readonly AdvancedDutyRunSnapshotStatus[];

export type ResumableAdvancedDutyRunSnapshotStatus = (typeof RESUMABLE_ADVANCED_DUTY_RUN_SNAPSHOT_STATUSES)[number];

const resumableAdvancedDutyRunSnapshotStatuses = new Set<AdvancedDutyRunSnapshotStatus>(
	RESUMABLE_ADVANCED_DUTY_RUN_SNAPSHOT_STATUSES
);

export function isResumableAdvancedDutyRunSnapshotStatus(
	status: AdvancedDutyRunSnapshotStatus
): status is ResumableAdvancedDutyRunSnapshotStatus {
	return resumableAdvancedDutyRunSnapshotStatuses.has(status);
}

export type AdvancedRunUiState =
	| 'draft'
	| 'stale'
	| 'expired'
	| 'applying'
	| 'applied'
	| 'failed-before-persistence'
	| 'partial-recovery';

export interface AdvancedDutyRunSnapshotRecord {
	id: string;
	orgId: string;
	templateId: string;
	templateName: string;
	pattern: DutyEventRunPattern;
	startDate: string;
	endDate: string;
	eventCount: number;
	eventDates: string[];
	candidatePersonnelIds: string[];
	draftLineageKey: string;
	snapshotFingerprint: string;
	snapshotVersion: number;
	status: AdvancedDutyRunSnapshotStatus;
	inputPayload: Record<string, unknown>;
	snapshotPayload: Record<string, unknown>;
	previewPayload: Record<string, unknown>;
	exportModel: Record<string, unknown> | null;
	createdByUserId: string | null;
	appliedRunId: string | null;
	applyError: string | null;
	expiresAt: string;
	appliedAt: string | null;
	createdAt: string;
	updatedAt: string;
}

export type AdvancedDutyRevisionDraftStatus = 'draft' | 'applied' | 'discarded';
export type AdvancedDutyRevisionChangeIntent = 'assign' | 'clear' | 'lock-assigned' | 'lock-open';

export interface AdvancedDutyRevisionDraftRecord {
	id: string;
	orgId: string;
	appliedRunId: string;
	sourceSnapshotId: string | null;
	sourceSnapshotFingerprint: string | null;
	sourceRunCreatedAt: string | null;
	sourceRunUpdatedAt: string | null;
	status: AdvancedDutyRevisionDraftStatus;
	slotChanges: unknown[];
	reason: string | null;
	latestValidation: Record<string, unknown> | null;
	latestError: string | null;
	conflictSummary: Record<string, unknown> | null;
	draftVersion: number;
	createdByUserId: string | null;
	updatedByUserId: string | null;
	appliedByUserId: string | null;
	discardedByUserId: string | null;
	expiresAt: string;
	discardCleanupAfter: string | null;
	appliedAt: string | null;
	discardedAt: string | null;
	createdAt: string;
	updatedAt: string;
}

export interface AdvancedDutyRevisionChangeSetRecord {
	id: string;
	orgId: string;
	appliedRunId: string;
	sourceDraftId: string | null;
	sourceSnapshotId: string | null;
	sourceSnapshotFingerprint: string | null;
	reason: string;
	actorUserId: string | null;
	reviewableConflictsConfirmed: boolean;
	conflictSummary: Record<string, unknown> | null;
	warningSummary: Record<string, unknown> | null;
	appliedAt: string;
	createdAt: string;
}

export interface AdvancedDutyRevisionSlotChangeRecord {
	id: string;
	orgId: string;
	changeSetId: string;
	dutyEventId: string | null;
	eventDate: string;
	slotKey: string;
	templateSlotId: string | null;
	roleLabel: string;
	slotIndex: number;
	previousPersonnelId: string | null;
	newPersonnelId: string | null;
	previousPersonnelSnapshot: Record<string, unknown> | null;
	newPersonnelSnapshot: Record<string, unknown> | null;
	previousAssignmentSource: DutyEventAssignmentSource | null;
	newAssignmentSource: DutyEventAssignmentSource | null;
	previousWarningState: DutyEventWarningState | null;
	newWarningState: DutyEventWarningState | null;
	changeIntent: AdvancedDutyRevisionChangeIntent;
	warningMetadata: Record<string, unknown> | null;
	conflictMetadata: Record<string, unknown> | null;
	createdAt: string;
}

export interface AdvancedDutyRevisionHistoryEntry {
	id: string;
	appliedRunId: string;
	appliedAt: string;
	actorUserId: string | null;
	actorLabel: string;
	reason: string;
	changeCount: number;
	changes: AdvancedDutyRevisionSlotChangeRecord[];
}

export interface DutyEventSlotOverrideInput {
	templateSlotId: string | null;
	slotIndex: number;
	assigneeId: string | null;
	assignmentSource?: Exclude<DutyEventAssignmentSource, 'generated'>;
}

export interface DutyEventApplyInput {
	templateId: string;
	eventDate: string;
	snapshotId?: string;
	snapshotFingerprint?: string;
	collisionReviewConfirmed?: boolean;
	candidatePersonnelIds?: string[];
	slotOverrides?: DutyEventSlotOverrideInput[];
}

export interface ExistingDutyEventInput {
	dutyEventId: string;
	slotOverrides?: DutyEventSlotOverrideInput[];
}

export interface ExistingDutyEventUpdateInput extends ExistingDutyEventInput {
	collisionReviewConfirmed?: boolean;
}

export interface AdvancedDutyRevisionDraftSession {
	action?: 'created' | 'reopened' | 'updated';
	draft: AdvancedDutyRevisionDraftRecord;
	preview: DutyEventPreview;
}

export interface AdvancedDutyRevisionReapplyResult {
	draft: AdvancedDutyRevisionDraftRecord;
	changeSet: AdvancedDutyRevisionChangeSetRecord;
	slotChanges: AdvancedDutyRevisionSlotChangeRecord[];
	updatedEvents: DutyEvent[];
}

export interface DutyEventSeriesEventOverrideInput {
	eventDate: string;
	slotOverrides: DutyEventSlotOverrideInput[];
}

export interface DutyEventPreview {
	snapshotId?: string;
	snapshotFingerprint?: string;
	snapshotVersion?: number;
	templateId: string;
	templateName: string;
	eventDate: string;
	advancedDa6SequenceKey?: 'single' | 'weekday' | 'weekend-holiday';
	advancedDa6SequenceLabel?: string;
	coverageMode: DutyTemplateCoverageMode;
	coverageStart: string;
	coverageEnd: string;
	isBlocking: boolean;
	cooldownHours: number;
	rulesSnapshot: DutyEventRulesSnapshot;
	fillSummary: DutyEventFillSummary;
	collisionSummary: DutyEventCollisionSummary;
	slotInstances: DutyEventPreviewSlotInstance[];
}

export interface DutyEventSeriesInput {
	templateId: string;
	startDate?: string;
	endDate?: string;
	pattern: DutyEventSeriesPattern;
	snapshotId?: string;
	snapshotFingerprint?: string;
	selectedWeekdays?: number[];
	customDates?: string[];
	collisionReviewConfirmed?: boolean;
	candidatePersonnelIds?: string[];
	eventOverrides?: DutyEventSeriesEventOverrideInput[];
}

export interface DutyEventSeriesPreview {
	snapshotId?: string;
	snapshotFingerprint?: string;
	snapshotVersion?: number;
	templateId: string;
	templateName: string;
	pattern: DutyEventSeriesPattern;
	eventDates: string[];
	events: DutyEventPreview[];
	da6Matrices?: AdvancedDutyDa6Matrix[];
}

export interface DutyEventSeriesApplyResult {
	run: DutyEventRunRecord;
	templateId: string;
	templateName: string;
	pattern: DutyEventSeriesPattern;
	eventDates: string[];
	events: DutyEvent[];
}

export interface DutyEventRunDeleteResult {
	deletedEvents: number;
}
