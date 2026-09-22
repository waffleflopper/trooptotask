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
