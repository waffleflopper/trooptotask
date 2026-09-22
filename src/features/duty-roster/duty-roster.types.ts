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
