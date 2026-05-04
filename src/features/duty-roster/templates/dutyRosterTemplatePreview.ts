import { buildDutyRosterRunSnapshot } from '$features/duty-roster/run/dutyRosterRun';
import type { DutyRosterRunDuration, DutyRosterRunSnapshot } from '$features/duty-roster/run/dutyRosterRun.types';
import type { AssignmentType, AvailabilityEntry, Personnel, SpecialDay, StatusType } from '$lib/types';
import type { DutyRosterPoolPersonnel, DutyRosterTemplate } from './dutyRosterTemplates';
import { resolveDutyRosterPool } from './dutyRosterPool';

export interface DutyRosterTemplatePreviewInput {
	template: DutyRosterTemplate;
	personnel: DutyRosterPoolPersonnel[];
	availabilityEntries: AvailabilityEntry[];
	statusTypes: StatusType[];
	specialDays: SpecialDay[];
	startDate: string;
	endDate: string;
	dutyDuration?: DutyRosterRunDuration;
	generatedAt?: string;
}

export type DutyRosterTemplatePreview = DutyRosterRunSnapshot;

export function buildDutyRosterTemplatePreview(input: DutyRosterTemplatePreviewInput): DutyRosterTemplatePreview {
	const resolvedPool = resolveDutyRosterPool({
		criteria: input.template.poolCriteria,
		personnel: input.personnel
	});

	return buildDutyRosterRunSnapshot({
		assignmentType: templateAssignmentType(input.template),
		personnel: resolvedPool.map(toPersonnel),
		assignments: [],
		rosterHistory: buildManualBaselineHistory(input.template, input.startDate),
		advancedDutyEvents: [],
		availabilityEntries: input.availabilityEntries,
		statusTypes: input.statusTypes,
		specialDays: input.specialDays,
		config: {
			startDate: input.startDate,
			endDate: input.endDate,
			dutyDuration: input.dutyDuration ?? 'daily',
			excludedStatusIds: input.statusTypes
				.filter((statusType) => Boolean(statusType.da6AvailabilityTreatment))
				.map((statusType) => statusType.id),
			excludeWeekends: false,
			excludeHolidays: false,
			excludeOrgClosures: false,
			exemptPersonnelIds: input.template.exemptPersonnelIds
		},
		generatedAt: input.generatedAt
	});
}

function templateAssignmentType(template: DutyRosterTemplate): AssignmentType {
	return {
		id: template.id,
		name: template.name,
		shortName: template.shortCode ?? template.name.slice(0, 12),
		assignTo: 'personnel',
		color: '#8a5a22',
		exemptPersonnelIds: [],
		showInDateHeader: true
	};
}

function toPersonnel(person: DutyRosterPoolPersonnel): Personnel {
	return {
		id: person.id,
		rank: person.rank,
		lastName: person.lastName,
		firstName: person.firstName,
		mos: person.mos,
		clinicRole: person.dutyRole,
		groupId: person.groupId,
		groupName: person.groupName,
		archivedAt: person.archivedAt
	};
}

function buildManualBaselineHistory(template: DutyRosterTemplate, startDate: string) {
	const counts = Object.entries(template.manualBaselineCounts).filter(([, count]) => count > 0);
	if (counts.length === 0) {
		return [];
	}

	const highestCount = Math.max(...counts.map(([, count]) => count));
	return [
		{
			assignmentTypeId: template.id,
			startDate: shiftDate(startDate, -highestCount),
			endDate: shiftDate(startDate, -1),
			roster: counts.map(([personnelId, count]) => ({
				date: shiftDate(startDate, -(highestCount - count + 1)),
				assigneeId: personnelId,
				assigneeName: null,
				assigneeRank: null,
				assigneeGroup: null
			})),
			config: {
				historySource: 'manual-da6-baseline'
			}
		}
	];
}

function shiftDate(value: string, offsetDays: number): string {
	const [yearValue, monthValue, dayValue] = value.split('-').map(Number);
	const date = new Date(Date.UTC(yearValue, monthValue - 1, dayValue + offsetDays));
	const year = date.getUTCFullYear();
	const month = String(date.getUTCMonth() + 1).padStart(2, '0');
	const day = String(date.getUTCDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}
