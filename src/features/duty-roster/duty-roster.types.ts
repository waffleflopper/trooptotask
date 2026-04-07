export type DutyTemplateMode = 'simple' | 'advanced';
export type DutyTemplateStatus = 'draft' | 'active' | 'archived';
export type DutyTemplateScopeType = 'organization' | 'groups';
export type DutyTemplateCoverageMode = 'all-day' | 'timed';
export type DutyTemplateSlotBlockingMode = 'inherit' | 'blocking' | 'non-blocking';
export type SoftPreferenceType = 'longest-break' | 'holiday-closure' | 'weekend' | 'preferred-group';
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

export const DEFAULT_SOFT_PREFERENCE_ORDER = [
	'longest-break',
	'holiday-closure',
	'weekend',
	'preferred-group'
] as const satisfies readonly SoftPreferenceType[];

export function cloneDefaultSoftPreferences(): SoftPreferenceConfig[] {
	return DEFAULT_SOFT_PREFERENCE_ORDER.map((type) => ({ type, enabled: true }));
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
	sortOrder: number;
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

export interface DutyEventSlotOverrideInput {
	templateSlotId: string | null;
	slotIndex: number;
	assigneeId: string | null;
	assignmentSource?: Exclude<DutyEventAssignmentSource, 'generated'>;
}

export interface DutyEventApplyInput {
	templateId: string;
	eventDate: string;
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

export interface DutyEventSeriesEventOverrideInput {
	eventDate: string;
	slotOverrides: DutyEventSlotOverrideInput[];
}

export interface DutyEventPreview {
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
	slotInstances: DutyEventPreviewSlotInstance[];
}

export interface DutyEventSeriesInput {
	templateId: string;
	startDate?: string;
	endDate?: string;
	pattern: DutyEventSeriesPattern;
	selectedWeekdays?: number[];
	customDates?: string[];
	collisionReviewConfirmed?: boolean;
	candidatePersonnelIds?: string[];
	eventOverrides?: DutyEventSeriesEventOverrideInput[];
}

export interface DutyEventSeriesPreview {
	templateId: string;
	templateName: string;
	pattern: DutyEventSeriesPattern;
	eventDates: string[];
	events: DutyEventPreview[];
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
