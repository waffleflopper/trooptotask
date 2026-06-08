import { buildDutyRosterRunSnapshot } from '$features/duty-roster/run/dutyRosterRun';
import type { DutyEventSeriesPattern } from '$features/duty-roster/duty-roster.types';
import type {
	Da6Cell,
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

export interface DutyRosterTemplateManualSelectionReview {
	selected: DutyRosterTemplatePreviewPersonnel | null;
	blockedReason: string | null;
	warnings: DutyRosterTemplateManualSelectionWarning[];
	reasonRequired: boolean;
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
	continuationHistory?: DutyRosterContinuationHistoryItem[];
	dutyDuration?: DutyRosterRunDuration;
	pattern?: DutyEventSeriesPattern;
	selectedWeekdays?: number[];
	skipHolidaysAndDonsas?: boolean;
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
		rosterHistory: input.continuationHistory ?? [],
		advancedDutyEvents: [],
		availabilityEntries: input.availabilityEntries,
		statusTypes: input.statusTypes,
		specialDays: input.specialDays,
		config: {
			startDate: input.startDate,
			endDate: input.endDate,
			dutyDuration: input.dutyDuration ?? 'daily',
			pattern: input.pattern ?? 'daily',
			selectedWeekdays: input.selectedWeekdays ?? [],
			excludedStatusIds: input.statusTypes
				.filter((statusType) => Boolean(statusType.da6AvailabilityTreatment))
				.map((statusType) => statusType.id),
			excludeWeekends: false,
			excludeHolidays: input.skipHolidaysAndDonsas ?? false,
			excludeOrgClosures: input.skipHolidaysAndDonsas ?? false,
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

	const review = reviewDutyRosterTemplateManualSelection(preview, input);
	if (review.blockedReason) {
		throw new Error(review.blockedReason);
	}

	const reason = input.reason?.trim() || null;
	if (review.reasonRequired && !reason) {
		throw new Error('A reason is required for this manual selection.');
	}

	const manualSelections = preview.manualSelections.filter((selection) => selection.date !== input.date);
	if (row.assigneeId === review.selected?.id && review.warnings.length === 0 && !reason) {
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
				assigneeId: review.selected?.id ?? input.assigneeId,
				reason,
				warnings: review.warnings
			}
		].sort((a, b) => a.date.localeCompare(b.date))
	});
}

export function reviewDutyRosterTemplateManualSelection(
	preview: DutyRosterTemplatePreview,
	input: Pick<DutyRosterTemplateManualSelectionInput, 'date' | 'assigneeId'>
): DutyRosterTemplateManualSelectionReview {
	const selected = preview.selectionPersonnel.find((person) => person.id === input.assigneeId) ?? null;
	if (!selected || selected.archivedAt) {
		return {
			selected,
			blockedReason: 'Selected Soldier is missing or archived.',
			warnings: [],
			reasonRequired: false
		};
	}

	const warnings = manualSelectionWarnings(preview, input.date, selected.id);
	return {
		selected,
		blockedReason: null,
		warnings,
		reasonRequired: warnings.length > 0
	};
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
	const da6 = buildDa6FromFinalRows(input.preview, finalRows);
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

export function buildDutyRosterTemplatePreviewDa6(
	preview: DutyRosterTemplatePreview
): DutyRosterTemplatePreview['da6'] {
	return buildDa6FromFinalRows(
		preview,
		preview.rosterRows.map((row) => acceptedSnapshotRow(preview, row.date))
	);
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

function buildDa6FromFinalRows(
	preview: DutyRosterTemplatePreview,
	finalRows: DutyRosterTemplateAcceptedSnapshotRow[]
): DutyRosterTemplatePreview['da6'] {
	const finalAssigneeByDate = new Map(finalRows.map((row) => [row.date, row.finalAssigneeId]));
	const baseRows = preview.da6.rows.map((row) => ({
		...row,
		display: { ...row.display },
		cells: row.cells.map((cell) => finalDa6Cell(cell, row.personnelId, finalAssigneeByDate))
	}));
	const existingPersonnelIds = new Set(baseRows.map((row) => row.personnelId));
	const missingFinalAssigneeIds = Array.from(
		new Set(
			finalRows
				.map((row) => row.finalAssigneeId)
				.filter(
					(assigneeId): assigneeId is string => typeof assigneeId === 'string' && !existingPersonnelIds.has(assigneeId)
				)
		)
	);
	const originallyAssignedCellByDate = new Map(
		preview.da6.rows.flatMap((row) => row.cells.filter((cell) => cell.assigned).map((cell) => [cell.date, cell]))
	);

	return {
		...preview.da6,
		columns: preview.da6.columns.map((column) => ({ ...column, specialDayIds: [...column.specialDayIds] })),
		rows: [
			...baseRows,
			...missingFinalAssigneeIds.flatMap((assigneeId) => {
				const display = previewAssignee(preview, assigneeId);
				if (!display) return [];
				return [
					{
						personnelId: assigneeId,
						display: {
							id: display.id,
							rank: display.rank,
							lastName: display.lastName,
							firstName: display.firstName,
							groupId: display.groupId,
							groupName: display.groupName
						},
						cells: preview.da6.columns.map((column) => {
							const assigned = finalAssigneeByDate.get(column.date) === assigneeId;
							if (assigned) {
								return assignedDa6CellForMissingRow(
									originallyAssignedCellByDate.get(column.date),
									column.date,
									assigneeId
								);
							}
							return blankDa6Cell(column.date, assigneeId);
						})
					}
				];
			})
		]
	};
}

function finalDa6Cell(cell: Da6Cell, personnelId: string, finalAssigneeByDate: Map<string, string | null>): Da6Cell {
	const assigned = finalAssigneeByDate.get(cell.date) === personnelId;
	if (assigned) {
		return {
			...cell,
			code: 'assigned',
			da6Code: null,
			assigned: true,
			reason: null,
			reasonCode: null
		};
	}
	if (cell.assigned) {
		return {
			...cell,
			code: 'available-not-selected',
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
}

function assignedDa6CellForMissingRow(source: Da6Cell | undefined, date: string, personnelId: string): Da6Cell {
	return {
		...(source ?? blankDa6Cell(date, personnelId)),
		date,
		personnelId,
		code: 'assigned',
		da6Code: null,
		assigned: true,
		reason: null,
		reasonCode: null
	};
}

function blankDa6Cell(date: string, personnelId: string): Da6Cell {
	return {
		date,
		personnelId,
		code: 'available-not-selected',
		da6Code: null,
		chargeable: false,
		queuePosition: null,
		sequenceNumber: null,
		assigned: false,
		reason: null,
		reasonCode: null
	};
}

function previewAssignee(
	preview: DutyRosterTemplatePreview,
	assigneeId: string
): DutyRosterTemplatePreviewPersonnel | null {
	return preview.selectionPersonnel.find((person) => person.id === assigneeId) ?? null;
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
