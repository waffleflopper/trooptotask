import { buildDutyRosterRunSnapshot } from '$features/duty-roster/run/dutyRosterRun';
import type {
	DutyRosterContinuationHistoryItem,
	DutyRosterRunDuration,
	DutyRosterRunSnapshot
} from '$features/duty-roster/run/dutyRosterRun.types';
import type { AssignmentType, AvailabilityEntry, Personnel, SpecialDay, StatusType } from '$lib/types';
import type { DutyRosterPoolPersonnel, DutyRosterTemplate } from './dutyRosterTemplates';
import { resolveDutyRosterPool } from './dutyRosterPool';

export type DutyRosterTemplateManualSelectionWarningCode = 'outside-pool' | 'unavailable-or-conflicting';

export interface DutyRosterTemplatePreviewPersonnel {
	id: string;
	rank: string;
	lastName: string;
	firstName: string;
	groupId: string | null;
	groupName: string;
	archivedAt: string | null;
}

export interface DutyRosterTemplateManualSelectionWarning {
	code: DutyRosterTemplateManualSelectionWarningCode;
	message: string;
}

export interface DutyRosterTemplateManualSelection {
	date: string;
	originalAssigneeId: string | null;
	assigneeId: string;
	reason: string | null;
	warnings: DutyRosterTemplateManualSelectionWarning[];
}

export interface DutyRosterTemplateManualSelectionInput {
	date: string;
	assigneeId: string;
	reason?: string | null;
}

export interface DutyRosterTemplateAcceptedSnapshotRow {
	date: string;
	generatedAssigneeId: string | null;
	finalAssigneeId: string | null;
	assignmentSource: 'generated' | 'manual';
	generatedDisplay: DutyRosterTemplatePreviewPersonnel | null;
	finalDisplay: DutyRosterTemplatePreviewPersonnel | null;
	reason: string | null;
	warnings: DutyRosterTemplateManualSelectionWarning[];
}

export interface DutyRosterTemplateAcceptedSnapshot {
	snapshotVersion: 1;
	template: {
		id: string;
		name: string;
		shortCode: string;
	};
	generatedAt: string;
	acceptedAt: string;
	acceptedByUserId: string | null;
	config: DutyRosterTemplatePreview['config'];
	resolvedPool: DutyRosterTemplatePreview['personnel'];
	selectionPersonnel: DutyRosterTemplatePreviewPersonnel[];
	generatedRows: DutyRosterTemplatePreview['rosterRows'];
	finalRows: DutyRosterTemplateAcceptedSnapshotRow[];
	manualSelections: DutyRosterTemplateManualSelection[];
	da6: DutyRosterTemplatePreview['da6'];
	exportModel: DutyRosterTemplatePreview['exportModel'];
	warnings: string[];
}

export interface DutyRosterTemplatePreviewInput {
	template: DutyRosterTemplate;
	personnel: DutyRosterPoolPersonnel[];
	availabilityEntries: AvailabilityEntry[];
	statusTypes: StatusType[];
	specialDays: SpecialDay[];
	startDate: string;
	endDate: string;
	acceptedHistory?: DutyRosterContinuationHistoryItem[];
	dutyDuration?: DutyRosterRunDuration;
	generatedAt?: string;
}

export type DutyRosterTemplatePreview = DutyRosterRunSnapshot & {
	selectionPersonnel: DutyRosterTemplatePreviewPersonnel[];
	manualSelections: DutyRosterTemplateManualSelection[];
};

export function buildDutyRosterTemplatePreview(input: DutyRosterTemplatePreviewInput): DutyRosterTemplatePreview {
	const resolvedPool = resolveDutyRosterPool({
		criteria: input.template.poolCriteria,
		personnel: input.personnel
	});

	const generated = buildDutyRosterRunSnapshot({
		assignmentType: templateAssignmentType(input.template),
		personnel: resolvedPool.map(toPersonnel),
		assignments: [],
		rosterHistory: input.acceptedHistory ?? buildManualBaselineHistory(input.template, input.startDate),
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

	return deepFreeze({
		...generated,
		selectionPersonnel: input.personnel.map(toPreviewPersonnel),
		manualSelections: []
	});
}

export function applyDutyRosterTemplateManualSelection(
	preview: DutyRosterTemplatePreview,
	input: DutyRosterTemplateManualSelectionInput
): DutyRosterTemplatePreview {
	const row = preview.rosterRows.find((candidate) => candidate.date === input.date);
	if (!row) {
		throw new Error('Duty date is not part of this preview.');
	}

	const selected = preview.selectionPersonnel.find((person) => person.id === input.assigneeId);
	if (!selected || selected.archivedAt) {
		throw new Error('Selected Soldier is missing or archived.');
	}

	const reason = input.reason?.trim() || null;
	const warnings = manualSelectionWarnings(preview, input.date, selected.id);
	if (warnings.length > 0 && !reason) {
		throw new Error('A reason is required for this manual selection.');
	}

	const manualSelections = preview.manualSelections.filter((selection) => selection.date !== input.date);
	if (row.assigneeId === selected.id && warnings.length === 0 && !reason) {
		return deepFreeze({
			...preview,
			manualSelections
		});
	}

	return deepFreeze({
		...preview,
		manualSelections: [
			...manualSelections,
			{
				date: input.date,
				originalAssigneeId: row.assigneeId,
				assigneeId: selected.id,
				reason,
				warnings
			}
		].sort((a, b) => a.date.localeCompare(b.date))
	});
}

export function manualSelectionForDate(
	preview: DutyRosterTemplatePreview,
	date: string
): DutyRosterTemplateManualSelection | null {
	return preview.manualSelections.find((selection) => selection.date === date) ?? null;
}

export function previewFinalAssigneeId(preview: DutyRosterTemplatePreview, date: string): string | null {
	const manualSelection = manualSelectionForDate(preview, date);
	if (manualSelection) {
		return manualSelection.assigneeId;
	}
	return preview.rosterRows.find((row) => row.date === date)?.assigneeId ?? null;
}

export function buildDutyRosterTemplateAcceptedSnapshot(input: {
	preview: DutyRosterTemplatePreview;
	acceptedAt: string;
	acceptedByUserId: string | null;
}): DutyRosterTemplateAcceptedSnapshot {
	const finalRows = input.preview.rosterRows.map((row) => acceptedSnapshotRow(input.preview, row.date));
	const da6 = buildAcceptedDa6(input.preview, finalRows);
	const exportModel = {
		...input.preview.exportModel,
		rosterRows: finalRows.map((row) => ({
			date: row.date,
			assigneeId: row.finalAssigneeId,
			...(row.reason ? { reason: row.reason } : {})
		})),
		da6
	};

	return deepFreeze({
		snapshotVersion: 1,
		template: {
			id: input.preview.assignmentType.id,
			name: input.preview.assignmentType.name,
			shortCode: input.preview.assignmentType.shortName
		},
		generatedAt: input.preview.generatedAt,
		acceptedAt: input.acceptedAt,
		acceptedByUserId: input.acceptedByUserId,
		config: input.preview.config,
		resolvedPool: input.preview.personnel,
		selectionPersonnel: input.preview.selectionPersonnel,
		generatedRows: input.preview.rosterRows,
		finalRows,
		manualSelections: input.preview.manualSelections,
		da6,
		exportModel,
		warnings: input.preview.warnings
	});
}

export function acceptedSnapshotToContinuationHistory(
	snapshot: DutyRosterTemplateAcceptedSnapshot
): DutyRosterContinuationHistoryItem {
	return {
		assignmentTypeId: snapshot.template.id,
		startDate: snapshot.config.startDate,
		endDate: snapshot.config.endDate,
		roster: snapshot.finalRows.map((row) => ({
			date: row.date,
			assigneeId: row.finalAssigneeId,
			assigneeName: row.finalDisplay ? `${row.finalDisplay.lastName}, ${row.finalDisplay.firstName}` : null,
			assigneeRank: row.finalDisplay?.rank ?? null,
			assigneeGroup: row.finalDisplay?.groupName ?? null,
			reason: row.reason ?? undefined
		})),
		config: {
			historySource: 'accepted-duty-roster-run'
		}
	};
}

export function assertDutyRosterTemplatePreview(value: unknown): asserts value is DutyRosterTemplatePreview {
	if (!value || typeof value !== 'object') {
		throw new Error('Generate the preview again before changing assignments.');
	}

	const preview = value as Partial<DutyRosterTemplatePreview>;
	if (
		!Array.isArray(preview.rosterRows) ||
		!Array.isArray(preview.personnel) ||
		!Array.isArray(preview.selectionPersonnel) ||
		!Array.isArray(preview.manualSelections) ||
		!preview.da6 ||
		!Array.isArray(preview.da6.rows)
	) {
		throw new Error('Generate the preview again before changing assignments.');
	}
}

function templateAssignmentType(template: DutyRosterTemplate): AssignmentType {
	return {
		id: template.assignmentTypeId,
		name: template.name,
		shortName: template.shortCode ?? template.name.slice(0, 12),
		assignTo: 'personnel',
		color: '#8a5a22',
		exemptPersonnelIds: [],
		showInDateHeader: false
	};
}

function toPreviewPersonnel(person: DutyRosterPoolPersonnel): DutyRosterTemplatePreviewPersonnel {
	return {
		id: person.id,
		rank: person.rank,
		lastName: person.lastName,
		firstName: person.firstName,
		groupId: person.groupId,
		groupName: person.groupName,
		archivedAt: person.archivedAt ?? null
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

function manualSelectionWarnings(
	preview: DutyRosterTemplatePreview,
	date: string,
	assigneeId: string
): DutyRosterTemplateManualSelectionWarning[] {
	const warnings: DutyRosterTemplateManualSelectionWarning[] = [];
	const inGeneratedPool = preview.personnel.some((person) => person.id === assigneeId);
	if (!inGeneratedPool) {
		warnings.push({
			code: 'outside-pool',
			message: 'Selected Soldier is outside this template pool.'
		});
	}

	const cell = preview.da6.rows
		.find((row) => row.personnelId === assigneeId)
		?.cells.find((candidate) => candidate.date === date);
	if (cell && !cell.assigned && cell.reason) {
		warnings.push({
			code: 'unavailable-or-conflicting',
			message: cell.reason
		});
	}

	return warnings;
}

function acceptedSnapshotRow(preview: DutyRosterTemplatePreview, date: string): DutyRosterTemplateAcceptedSnapshotRow {
	const generatedRow = preview.rosterRows.find((row) => row.date === date) ?? null;
	const manualSelection = manualSelectionForDate(preview, date);
	const finalAssigneeId = previewFinalAssigneeId(preview, date);
	const generatedDisplay = generatedRow?.assigneeId ? previewAssignee(preview, generatedRow.assigneeId) : null;
	const finalDisplay = finalAssigneeId ? previewAssignee(preview, finalAssigneeId) : null;

	return {
		date,
		generatedAssigneeId: generatedRow?.assigneeId ?? null,
		finalAssigneeId,
		assignmentSource: manualSelection ? 'manual' : 'generated',
		generatedDisplay,
		finalDisplay,
		reason: manualSelection?.reason ?? generatedRow?.reason ?? null,
		warnings: manualSelection?.warnings ?? []
	};
}

function buildAcceptedDa6(
	preview: DutyRosterTemplatePreview,
	finalRows: DutyRosterTemplateAcceptedSnapshotRow[]
): DutyRosterTemplatePreview['da6'] {
	const finalAssigneeByDate = new Map(finalRows.map((row) => [row.date, row.finalAssigneeId]));

	return {
		...preview.da6,
		columns: preview.da6.columns.map((column) => ({ ...column, specialDayIds: [...column.specialDayIds] })),
		rows: preview.da6.rows.map((row) => ({
			...row,
			display: { ...row.display },
			cells: row.cells.map((cell) => {
				const assigned = finalAssigneeByDate.get(cell.date) === row.personnelId;
				if (assigned) {
					return {
						...cell,
						code: 'assigned' as const,
						da6Code: null,
						assigned: true,
						reason: null,
						reasonCode: null
					};
				}
				if (cell.assigned) {
					return {
						...cell,
						code: 'available-not-selected' as const,
						da6Code: null,
						assigned: false,
						reason: null,
						reasonCode: null
					};
				}
				return {
					...cell,
					assigned: false
				};
			})
		}))
	};
}

function previewAssignee(
	preview: DutyRosterTemplatePreview,
	assigneeId: string
): DutyRosterTemplatePreviewPersonnel | null {
	return preview.selectionPersonnel.find((person) => person.id === assigneeId) ?? null;
}

function buildManualBaselineHistory(template: DutyRosterTemplate, startDate: string) {
	const counts = Object.entries(template.manualBaselineCounts).filter(([, count]) => count > 0);
	if (counts.length === 0) {
		return [];
	}

	const highestCount = Math.max(...counts.map(([, count]) => count));
	return [
		{
			assignmentTypeId: template.assignmentTypeId,
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

function deepFreeze<T>(value: T): T {
	if (value && typeof value === 'object' && !Object.isFrozen(value)) {
		for (const child of Object.values(value)) {
			deepFreeze(child);
		}
		Object.freeze(value);
	}
	return value;
}
