export type DutyTemplateMode = 'simple' | 'advanced';
export type DutyTemplateStatus = 'draft' | 'active' | 'archived';
export type DutyTemplateScopeType = 'organization' | 'groups';
export type DutyTemplateCoverageMode = 'all-day' | 'timed';
export type DutyEventSeriesPattern =
	| 'daily'
	| 'weekday-only'
	| 'weekend-only'
	| 'selected-weekdays'
	| 'holiday-closure-only'
	| 'custom-dates';

export interface DutyTemplateSlot {
	id: string;
	templateId: string;
	roleLabel: string;
	quantity: number;
	allowedRanks: string[];
	allowedGroupIds: string[];
	allowedMosValues: string[];
	allowedRoleValues: string[];
	sortOrder: number;
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
	coverageMode: DutyTemplateCoverageMode;
	startTime: string | null;
	endTime: string | null;
	isBlocking: boolean;
	cooldownHours: number;
	createdAt: string;
	updatedAt: string;
}

export interface DutyTemplate extends DutyTemplateRecord {
	slots: DutyTemplateSlot[];
}

export interface DutyTemplateSlotInput {
	id?: string;
	roleLabel: string;
	quantity: number;
	allowedRanks?: string[];
	allowedGroupIds?: string[];
	allowedMosValues?: string[];
	allowedRoleValues?: string[];
	sortOrder?: number;
}

export interface DutyTemplateWriteInput {
	id?: string;
	mode?: DutyTemplateMode;
	status: DutyTemplateStatus;
	name: string;
	description?: string | null;
	scopeType?: DutyTemplateScopeType;
	scopeGroupIds?: string[];
	coverageMode?: DutyTemplateCoverageMode;
	startTime?: string | null;
	endTime?: string | null;
	isBlocking?: boolean;
	cooldownHours?: number;
	slots?: DutyTemplateSlotInput[];
}

export interface DutyEventRulesSnapshot {
	templateId: string;
	templateName: string;
	templateStatus: DutyTemplateStatus;
	coverageMode: DutyTemplateCoverageMode;
	startTime: string | null;
	endTime: string | null;
	scopeType: DutyTemplateScopeType;
	scopeGroupIds: string[];
	isBlocking: boolean;
	cooldownHours: number;
	slots: Array<{
		templateSlotId: string;
		roleLabel: string;
		quantity: number;
		allowedRanks: string[];
		allowedGroupIds: string[];
		allowedMosValues: string[];
		allowedRoleValues: string[];
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
export type DutyEventWarningState = 'none' | 'warning';

export interface DutyEventSlotInstance {
	id: string;
	dutyEventId: string;
	templateSlotId: string | null;
	roleLabel: string;
	slotIndex: number;
	assigneeId: string | null;
	assignmentSource: DutyEventAssignmentSource;
	warningState: DutyEventWarningState;
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
	unfilledReason: string | null;
	sortOrder: number;
}

export interface DutyEventRecord {
	id: string;
	orgId: string;
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
	createdAt: string;
	updatedAt: string;
}

export interface DutyEvent extends DutyEventRecord {
	slotInstances: DutyEventSlotInstance[];
}

export interface DutyEventApplyInput {
	templateId: string;
	eventDate: string;
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
}

export interface DutyEventSeriesPreview {
	templateId: string;
	templateName: string;
	pattern: DutyEventSeriesPattern;
	eventDates: string[];
	events: DutyEventPreview[];
}

export interface DutyEventSeriesApplyResult {
	templateId: string;
	templateName: string;
	pattern: DutyEventSeriesPattern;
	eventDates: string[];
	events: DutyEvent[];
}
