export const DUTY_ROSTER_TEMPLATE_VIEWS = ['generate', 'history', 'settings'] as const;

export type DutyRosterTemplateView = (typeof DUTY_ROSTER_TEMPLATE_VIEWS)[number];

export interface DutyRosterTemplate {
	id: string;
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

export interface DutyRosterTemplateSettingsInput {
	templateId: string;
	poolCriteria: DutyRosterPoolCriteria;
	exemptPersonnelIds: string[];
	manualBaselineCounts: Record<string, number | null | undefined>;
}

export interface DutyRosterTemplateGenerateInput {
	templateId: string;
	startDate: string;
	endDate: string;
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
