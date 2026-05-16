import {
	manualSelectionForDate,
	previewFinalAssigneeId,
	reviewDutyRosterTemplateManualSelection,
	type DutyRosterTemplateAcceptedSnapshot,
	type DutyRosterTemplateManualSelection,
	type DutyRosterTemplatePreview,
	type DutyRosterTemplatePreviewPersonnel
} from '$features/duty-roster/templates/dutyRosterTemplatePreview';
import type {
	DutyRosterPoolPersonnelDisplay,
	DutyRosterTemplateAcceptedRun,
	DutyRosterTemplateRunCorrection
} from '$features/duty-roster/templates/dutyRosterTemplates';
import { dutyRosterTodayDate } from '$features/duty-roster/templates/dutyRosterDatePolicy';
import type { ColumnDef } from '$lib/components/ui/data-table';

export const DUTY_ROSTER_CORRECTION_OVERRIDE_WARNING = 'Outside normal pool. Saved as an override.';

export type DutyRosterPreviewReviewRow = {
	date: string;
	finalAssignee: DutyRosterTemplatePreviewPersonnel | null;
	generatedAssignee: DutyRosterTemplatePreviewPersonnel | null;
	unfilledReason: string;
	editAssigneeId: string;
	manualSelection: DutyRosterTemplateManualSelection | null;
	liveWarnings: string[];
};

export type DutyRosterMatrixCellTone = 'default' | 'assigned' | 'warning' | 'danger';

export type DutyRosterPreviewReviewModel = {
	rows: DutyRosterPreviewReviewRow[];
	selectionOptions: Array<{ value: string; label: string; description?: string }>;
	previewPayload: string;
	matrix: {
		columns: DutyRosterTemplatePreview['da6']['columns'];
		rows: Array<{
			personnelId: string;
			soldierLabel: string;
			cells: Array<{
				date: string;
				assigned: boolean;
				tone: DutyRosterMatrixCellTone;
				display: string;
				chargeable: boolean;
				sequenceNumber: number | null;
				reason: string | null;
			}>;
		}>;
	};
};

export type DutyRosterAcceptedHistoryTableRow = {
	id: string;
	run: DutyRosterTemplateAcceptedRun;
	snapshot: DutyRosterTemplateAcceptedSnapshot;
	finalRow: DutyRosterTemplateAcceptedSnapshot['finalRows'][number];
	correction: DutyRosterTemplateRunCorrection | null;
	isInvalidated: boolean;
	date: string;
	assignedSearchText: string;
	sourceLabel: 'CORRECTED' | 'MANUAL' | 'Generated';
	reviewText: string;
	correctionSummary: {
		replacementName: string;
		originalName: string;
		reason: string;
		countText: string;
		overrideText: string | null;
	} | null;
	correctionLockedText: string | null;
	reasonText: string | null;
	canCorrect: boolean;
	correctionOptions: Array<{ value: string; label: string; description?: string }>;
	correctionOverrideWarnings: Record<string, string>;
};

export type DutyRosterAcceptedRunReviewModel = {
	run: DutyRosterTemplateAcceptedRun;
	snapshot: DutyRosterTemplateAcceptedSnapshot;
	isInvalidated: boolean;
	calendarState: 'apply' | 'applied' | 'reapply';
	canInvalidate: boolean;
	invalidateDisabledReason: string | null;
	calendarStepLabel: 'Closed' | 'Applied' | 'Needs sync' | 'Not applied';
	rows: DutyRosterAcceptedHistoryTableRow[];
	matrix: {
		columns: DutyRosterTemplateAcceptedSnapshot['da6']['columns'];
		rows: Array<{
			personnelId: string;
			soldierLabel: string;
			cells: Array<{
				date: string;
				assigned: boolean;
				tone: DutyRosterMatrixCellTone;
				display: string;
				chargeable: boolean;
				sequenceNumber: number | null;
				reason: string | null;
			}>;
		}>;
	};
};

export const acceptedHistoryColumns: ColumnDef<DutyRosterAcceptedHistoryTableRow>[] = [
	{
		key: 'date',
		header: 'Date',
		value: (row) => row.date
	},
	{
		key: 'assigned',
		header: 'Assigned',
		value: (row) => row.finalRow.finalDisplay?.lastName ?? 'Unfilled',
		searchValue: (row) => row.assignedSearchText
	},
	{
		key: 'source',
		header: 'Source',
		value: (row) => row.sourceLabel,
		sortable: false
	},
	{
		key: 'warnings',
		header: 'Warnings',
		value: (row) => row.finalRow.warnings.length,
		sortable: false
	},
	{
		key: 'review',
		header: 'Review State',
		value: (row) => row.reviewText,
		sortable: false
	}
];

export function buildDutyRosterPreviewReviewModel(input: {
	preview: DutyRosterTemplatePreview;
	selectedAssigneeIds?: Record<string, string>;
}): DutyRosterPreviewReviewModel {
	const selectedAssigneeIds = input.selectedAssigneeIds ?? {};

	return {
		rows: input.preview.rosterRows.map((row) => {
			const manualSelection = manualSelectionForDate(input.preview, row.date);
			const editAssigneeId =
				selectedAssigneeIds[row.date] ?? previewFinalAssigneeId(input.preview, row.date) ?? row.assigneeId ?? '';

			return {
				date: row.date,
				finalAssignee: previewAssignee(input.preview, previewFinalAssigneeId(input.preview, row.date)),
				generatedAssignee: previewAssignee(input.preview, row.assigneeId),
				unfilledReason: row.reason ?? 'No eligible Soldier',
				editAssigneeId,
				manualSelection,
				liveWarnings: previewSelectionWarnings(input.preview, row.date, editAssigneeId)
			};
		}),
		selectionOptions: personnelOptionItems(input.preview.selectionPersonnel),
		previewPayload: previewFormValue(input.preview),
		matrix: {
			columns: input.preview.da6.columns,
			rows: input.preview.da6.rows.map((row) => ({
				personnelId: row.personnelId,
				soldierLabel: `${row.display.rank} ${row.display.lastName}`,
				cells: row.cells.map((cell) => ({
					date: cell.date,
					assigned: cell.assigned,
					tone: da6CellTone(cell),
					display: previewCellDisplay(cell),
					chargeable: cell.chargeable,
					sequenceNumber: cell.sequenceNumber,
					reason: cell.reason
				}))
			}))
		}
	};
}

export function buildDutyRosterAcceptedRunReviewModel(input: {
	run: DutyRosterTemplateAcceptedRun;
	isLatestRun: boolean;
	todayDate?: string;
}): DutyRosterAcceptedRunReviewModel {
	const snapshot = acceptedSnapshot(input.run);
	const isInvalidated = input.run.status === 'invalidated';
	const calendarState = calendarActionState(input.run);
	const todayDate = input.todayDate ?? dutyRosterTodayDate();
	const canInvalidate = !isInvalidated && input.run.endDate >= todayDate;
	const rows = snapshot.finalRows.map((row) => {
		const correction = latestCorrectionForDate(input.run, row.date);
		const sourceLabel: DutyRosterAcceptedHistoryTableRow['sourceLabel'] = correction
			? 'CORRECTED'
			: row.assignmentSource === 'manual'
				? 'MANUAL'
				: 'Generated';
		const correctionSummary = correction
			? {
					replacementName: correctionPersonName(correction.replacementDisplay, correction.replacementAssigneeId),
					originalName: correctionPersonName(correction.originalDisplay, correction.originalAssigneeId),
					reason: correction.reason,
					countText: correction.countsTowardFuture
						? 'Counts toward future DA6 runs.'
						: 'Non-counting because this run is invalidated.',
					overrideText: correction.poolOverride ? DUTY_ROSTER_CORRECTION_OVERRIDE_WARNING : null
				}
			: null;

		return {
			id: `${input.run.id}:${row.date}`,
			run: input.run,
			snapshot,
			finalRow: row,
			correction,
			isInvalidated,
			date: row.date,
			assignedSearchText: row.finalDisplay
				? `${row.finalDisplay.rank} ${row.finalDisplay.lastName}, ${row.finalDisplay.firstName}`
				: 'Unfilled',
			sourceLabel,
			reviewText: correction ? 'Corrected' : row.reason || '',
			correctionSummary,
			correctionLockedText:
				isInvalidated && input.run.corrections.some((item) => item.runRowDate === row.date)
					? 'Correction trail is locked with this invalidated run.'
					: null,
			reasonText: row.reason,
			canCorrect: !isInvalidated && Boolean(row.finalAssigneeId),
			correctionOptions: personnelOptionItems(snapshot.selectionPersonnel, row.finalAssigneeId),
			correctionOverrideWarnings: correctionOverrideWarnings(snapshot, row.finalAssigneeId)
		};
	});

	return {
		run: input.run,
		snapshot,
		isInvalidated,
		calendarState,
		canInvalidate,
		invalidateDisabledReason:
			!isInvalidated && !canInvalidate ? 'Runs with end dates before today cannot be invalidated.' : null,
		calendarStepLabel: isInvalidated
			? 'Closed'
			: calendarState === 'applied'
				? 'Applied'
				: calendarState === 'reapply'
					? 'Needs sync'
					: 'Not applied',
		rows,
		matrix: {
			columns: snapshot.da6.columns,
			rows: snapshot.da6.rows.map((row) => ({
				personnelId: row.personnelId,
				soldierLabel: `${row.display.rank} ${row.display.lastName}`,
				cells: row.cells.map((cell) => ({
					date: cell.date,
					assigned: cell.assigned,
					tone: da6CellTone(cell),
					display: da6CellDisplay(cell),
					chargeable: cell.chargeable,
					sequenceNumber: cell.sequenceNumber,
					reason: cell.reason
				}))
			}))
		}
	};
}

export function personnelOptionItems(
	personnel: DutyRosterTemplatePreview['selectionPersonnel'] | DutyRosterTemplateAcceptedSnapshot['selectionPersonnel'],
	excludeId?: string | null
): Array<{ value: string; label: string; description?: string }> {
	return personnel
		.filter((person) => person.id !== excludeId && !person.archivedAt)
		.map((person) => ({
			value: person.id,
			label: `${person.rank} ${person.lastName}, ${person.firstName}`,
			description: person.groupName
		}));
}

export function correctionOverrideWarnings(
	snapshot: DutyRosterTemplateAcceptedSnapshot,
	excludeId?: string | null
): Record<string, string> {
	const resolvedPoolIds = new Set(snapshot.resolvedPool.map((person) => person.id));
	const exemptPersonnelIds = new Set(snapshot.config.exemptPersonnelIds ?? []);

	return Object.fromEntries(
		snapshot.selectionPersonnel
			.filter((person) => person.id !== excludeId && !person.archivedAt)
			.filter((person) => !resolvedPoolIds.has(person.id) || exemptPersonnelIds.has(person.id))
			.map((person) => [person.id, DUTY_ROSTER_CORRECTION_OVERRIDE_WARNING])
	);
}

export function issueLabel(warnings: Array<{ message: string }>): string {
	if (warnings.length === 0) return 'Clear';
	return warnings.length === 1 ? 'Review' : `${warnings.length} issues`;
}

export function issueTitle(warnings: Array<{ message: string }>): string {
	return warnings.length > 0 ? warnings.map((warning) => warning.message).join(' ') : 'No issue flagged.';
}

export function previewFormValue(preview: DutyRosterTemplatePreview): string {
	return JSON.stringify(preview);
}

export function previewCellDisplay(cell: DutyRosterTemplatePreview['da6']['rows'][number]['cells'][number]): string {
	return da6CellDisplay(cell);
}

function da6CellTone(
	cell:
		| DutyRosterTemplatePreview['da6']['rows'][number]['cells'][number]
		| DutyRosterTemplateAcceptedSnapshot['da6']['rows'][number]['cells'][number]
): DutyRosterMatrixCellTone {
	if (cell.assigned) return 'assigned';
	if (cell.da6Code === 'A') return 'warning';
	if (cell.da6Code === 'D' || cell.da6Code === 'U') return 'danger';
	return 'default';
}

export function acceptedSnapshot(run: DutyRosterTemplateAcceptedRun): DutyRosterTemplateAcceptedSnapshot {
	return run.snapshotPayload as unknown as DutyRosterTemplateAcceptedSnapshot;
}

export function latestCorrectionForDate(run: DutyRosterTemplateAcceptedRun, date: string) {
	return run.corrections.filter((correction) => correction.runRowDate === date).at(-1) ?? null;
}

export function calendarActionState(run: DutyRosterTemplateAcceptedRun): 'apply' | 'applied' | 'reapply' {
	if (!run.appliedAt) return 'apply';
	if (run.calendarAssignmentsEdited) return 'reapply';
	return 'applied';
}

export function correctionKey(runId: string, date: string): string {
	return `${runId}:${date}`;
}

function correctionPersonName(display: DutyRosterPoolPersonnelDisplay | null, fallbackId: string): string {
	return display ? `${display.rank} ${display.lastName}, ${display.firstName}` : fallbackId;
}

function da6CellDisplay(
	cell:
		| DutyRosterTemplatePreview['da6']['rows'][number]['cells'][number]
		| DutyRosterTemplateAcceptedSnapshot['da6']['rows'][number]['cells'][number]
): string {
	if (cell.assigned) {
		return 'X';
	}
	if (cell.da6Code === 'A') {
		return 'A';
	}
	if (cell.da6Code === 'D' || cell.da6Code === 'U') {
		return cell.da6Code;
	}
	return cell.sequenceNumber === null ? '' : String(cell.sequenceNumber);
}

function previewAssignee(
	preview: DutyRosterTemplatePreview,
	assigneeId: string | null
): DutyRosterTemplatePreviewPersonnel | null {
	return preview.selectionPersonnel.find((person) => person.id === assigneeId) ?? null;
}

function previewSelectionWarnings(preview: DutyRosterTemplatePreview, date: string, selectedId: string): string[] {
	if (!selectedId) return [];
	return reviewDutyRosterTemplateManualSelection(preview, { date, assigneeId: selectedId }).warnings.map(
		(warning) => warning.message
	);
}
