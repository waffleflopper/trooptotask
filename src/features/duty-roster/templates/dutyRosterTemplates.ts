export const DUTY_ROSTER_TEMPLATE_VIEWS = ['generate', 'history', 'settings'] as const;

export type DutyRosterTemplateView = (typeof DUTY_ROSTER_TEMPLATE_VIEWS)[number];

export interface DutyRosterTemplate {
	id: string;
	assignmentTypeId: string;
	name: string;
	slug: string;
	shortCode: string | null;
	status: 'active' | 'archived';
	poolCriteria: DutyRosterPoolCriteria;
	exemptPersonnelIds: string[];
	manualBaselineCounts: Record<string, number>;
	createdAt: string;
	updatedAt: string;
}

export interface DutyRosterTemplateCreateInput {
	name: string;
	shortCode?: string | null;
}

export interface DutyRosterTemplateConfiguredCreateInput {
	name: string;
	slug?: string | null;
	shortCode?: string | null;
	poolCriteria: DutyRosterPoolCriteria;
	exemptPersonnelIds: string[];
	manualBaselineCounts: Record<string, number | null | undefined>;
}

export interface DutyRosterPoolCriteria {
	rankValues: string[];
	groupIds: string[];
	mosValues: string[];
	dutyRoleValues: string[];
}

export interface DutyRosterPoolPersonnel {
	id: string;
	rank: string;
	lastName: string;
	firstName: string;
	mos: string;
	dutyRole: string;
	groupId: string | null;
	groupName: string;
	archivedAt?: string | null;
}

export interface DutyRosterBaselineRow {
	personnel: DutyRosterPoolPersonnel;
	startingCount: number | null;
}

export interface DutyRosterTemplateSettingsData {
	personnel: DutyRosterPoolPersonnel[];
	resolvedPool: DutyRosterPoolPersonnel[];
	baselineRows: DutyRosterBaselineRow[];
}

export interface DutyRosterTemplateSetupOptions {
	personnel: DutyRosterPoolPersonnel[];
}

export type DutyRosterTemplateCountSource = 'da6-roster-order' | 'manual-da6-baseline' | 'accepted-history';

export interface DutyRosterTemplateCountRow {
	personnelId: string;
	display: DutyRosterPoolPersonnelDisplay | null;
	count: number;
	lastDutyDate: string | null;
}

export interface DutyRosterTemplateCountReadModel {
	templateId: string;
	source: DutyRosterTemplateCountSource;
	sourceLabel: string;
	sourceDescription: string;
	rows: DutyRosterTemplateCountRow[];
	acceptedRunCount: number;
	invalidatedRunCount: number;
	countingCorrectionCount: number;
	nonCountingCorrectionCount: number;
}

export interface DutyRosterTemplateSettingsInput {
	templateId: string;
	name?: string | null;
	slug?: string | null;
	shortCode?: string | null;
	poolCriteria: DutyRosterPoolCriteria;
	exemptPersonnelIds: string[];
	manualBaselineCounts: Record<string, number | null | undefined>;
}

export interface DutyRosterTemplateArchiveInput {
	templateId: string;
}

export interface DutyRosterTemplateGenerateInput {
	templateId: string;
	startDate: string;
	endDate: string;
}

export interface DutyRosterTemplateManualSelectionInput {
	preview: string;
	date: string;
	assigneeId: string;
	reason?: string | null;
}

export interface DutyRosterTemplateAcceptPreviewInput {
	preview: string;
}

export interface DutyRosterTemplateAcceptedRun {
	id: string;
	templateId: string;
	templateName: string;
	status: 'accepted' | 'invalidated';
	startDate: string;
	endDate: string;
	acceptedAt: string;
	acceptedByUserId: string | null;
	acceptedByDisplayName?: string | null;
	appliedAt: string | null;
	appliedByUserId: string | null;
	invalidatedAt: string | null;
	invalidatedByUserId: string | null;
	linkedCalendarAssignmentCount: number;
	calendarAssignmentsEdited: boolean;
	corrections: DutyRosterTemplateRunCorrection[];
	snapshotPayload: Record<string, unknown>;
	createdAt: string;
}

export interface DutyRosterTemplateRunCorrection {
	id: string;
	runId: string;
	runRowDate: string;
	originalAssigneeId: string;
	originalDisplay: DutyRosterPoolPersonnelDisplay | null;
	replacementAssigneeId: string;
	replacementDisplay: DutyRosterPoolPersonnelDisplay | null;
	reason: string;
	correctedByUserId: string | null;
	correctedAt: string;
	countsTowardFuture: boolean;
	poolOverride: boolean;
	poolOverrideReasons: DutyRosterCorrectionPoolOverrideReason[];
}

export type DutyRosterCorrectionPoolOverrideReason = 'outside-pool' | 'exempt';

export interface DutyRosterPoolPersonnelDisplay {
	id: string;
	rank: string;
	lastName: string;
	firstName: string;
	groupName: string;
}

export interface DutyRosterTemplateCorrectionInput {
	runId: string;
	runRowDate: string;
	replacementAssigneeId: string;
	reason: string;
}

const DEFAULT_SLUG = 'duty-roster';
const MAX_SLUG_LENGTH = 72;
const MAX_SHORT_CODE_LENGTH = 12;

export const EMPTY_DUTY_ROSTER_POOL_CRITERIA: DutyRosterPoolCriteria = {
	rankValues: [],
	groupIds: [],
	mosValues: [],
	dutyRoleValues: []
};

export function isDutyRosterTemplateView(value: string): value is DutyRosterTemplateView {
	return DUTY_ROSTER_TEMPLATE_VIEWS.includes(value as DutyRosterTemplateView);
}

export function normalizeDutyRosterTemplateName(value: string): string {
	return value.trim().replace(/\s+/g, ' ');
}

export function normalizeDutyRosterShortCode(value: string | null | undefined): string | null {
	const normalized = value?.trim().replace(/\s+/g, ' ').toUpperCase() ?? '';
	return normalized ? normalized.slice(0, MAX_SHORT_CODE_LENGTH) : null;
}

export function slugifyDutyRosterTemplateName(value: string): string {
	const slug = normalizeDutyRosterTemplateName(value)
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, MAX_SLUG_LENGTH)
		.replace(/-+$/g, '');

	return slug || DEFAULT_SLUG;
}

export function normalizeDutyRosterTemplateSlug(value: string | null | undefined, fallbackName: string): string {
	const normalized = value?.trim() ? value : fallbackName;
	return slugifyDutyRosterTemplateName(normalized ?? fallbackName);
}

export function buildUniqueDutyRosterTemplateSlug(input: { name: string; existingSlugs: Iterable<string> }): string {
	const existing = new Set([...input.existingSlugs].map((slug) => slug.toLowerCase()));
	const base = slugifyDutyRosterTemplateName(input.name);

	if (!existing.has(base)) {
		return base;
	}

	for (let suffix = 2; suffix < 1000; suffix += 1) {
		const suffixText = `-${suffix}`;
		const candidate = `${base.slice(0, MAX_SLUG_LENGTH - suffixText.length).replace(/-+$/g, '')}${suffixText}`;
		if (!existing.has(candidate)) {
			return candidate;
		}
	}

	throw new Error('Could not generate a unique Duty Roster Template slug.');
}
