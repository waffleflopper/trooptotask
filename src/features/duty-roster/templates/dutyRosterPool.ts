import type {
	DutyRosterBaselineRow,
	DutyRosterPoolCriteria,
	DutyRosterPoolPersonnel,
	DutyRosterTemplate
} from './dutyRosterTemplates';

export function normalizeDutyRosterPoolCriteria(input: DutyRosterPoolCriteria): DutyRosterPoolCriteria {
	return {
		rankValues: normalizeValues(input.rankValues),
		groupIds: normalizeValues(input.groupIds),
		mosValues: normalizeValues(input.mosValues),
		dutyRoleValues: normalizeValues(input.dutyRoleValues)
	};
}

export function resolveDutyRosterPool(input: {
	criteria: DutyRosterPoolCriteria;
	personnel: DutyRosterPoolPersonnel[];
}): DutyRosterPoolPersonnel[] {
	const criteria = normalizeDutyRosterPoolCriteria(input.criteria);

	return input.personnel
		.filter((person) => !person.archivedAt)
		.filter((person) => matchesCategory(criteria.rankValues, person.rank))
		.filter((person) => matchesCategory(criteria.groupIds, person.groupId))
		.filter((person) => matchesCategory(criteria.mosValues, person.mos))
		.filter((person) => matchesCategory(criteria.dutyRoleValues, person.dutyRole));
}

export function normalizeDutyRosterExemptions(input: {
	exemptPersonnelIds: string[];
	resolvedPool: DutyRosterPoolPersonnel[];
}): string[] {
	const resolvedIds = new Set(input.resolvedPool.map((person) => person.id));
	return normalizeValues(input.exemptPersonnelIds).filter((personId) => resolvedIds.has(personId));
}

export function buildDutyRosterBaselineRows(input: {
	template: Pick<DutyRosterTemplate, 'exemptPersonnelIds' | 'manualBaselineCounts'>;
	resolvedPool: DutyRosterPoolPersonnel[];
}): DutyRosterBaselineRow[] {
	const exemptIds = new Set(input.template.exemptPersonnelIds);

	return input.resolvedPool
		.filter((person) => !exemptIds.has(person.id))
		.map((person) => ({
			personnel: person,
			startingCount: input.template.manualBaselineCounts[person.id] ?? null
		}));
}

export function findInvalidDutyRosterSetupIds(input: {
	exemptPersonnelIds: string[];
	manualBaselineCounts: Record<string, number | null | undefined>;
	resolvedPool: DutyRosterPoolPersonnel[];
}): { invalidExemptionIds: string[]; invalidBaselineIds: string[] } {
	const resolvedIds = new Set(input.resolvedPool.map((person) => person.id));
	const exemptIds = new Set(input.exemptPersonnelIds);
	const baselineEligibleIds = new Set(
		input.resolvedPool.filter((person) => !exemptIds.has(person.id)).map((person) => person.id)
	);

	return {
		invalidExemptionIds: normalizeValues(input.exemptPersonnelIds).filter((personId) => !resolvedIds.has(personId)),
		invalidBaselineIds: Object.entries(input.manualBaselineCounts)
			.filter(([, value]) => value !== null && value !== undefined)
			.map(([personId]) => personId)
			.filter((personId) => !baselineEligibleIds.has(personId))
			.sort((a, b) => a.localeCompare(b))
	};
}

function normalizeValues(values: string[]): string[] {
	return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function matchesCategory(allowedValues: string[], value: string | null | undefined): boolean {
	if (allowedValues.length === 0) {
		return true;
	}

	return !!value && allowedValues.includes(value);
}
