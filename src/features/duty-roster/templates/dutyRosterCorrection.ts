import type { Da6Cell, Da6Matrix } from '$features/duty-roster/run/dutyRosterRun.types';
import type { DutyRosterTemplateAcceptedSnapshot } from './dutyRosterTemplatePreview';

export type DutyRosterCorrectionEffect = {
	runRowDate: string;
	replacementAssigneeId: string;
	reason: string;
};

export function dutyRosterCorrectionCountsTowardFuture(input: { runStatus: 'accepted' | 'invalidated' }): boolean {
	return input.runStatus === 'accepted';
}

export function latestDutyRosterCorrectionsByDate(
	corrections: DutyRosterCorrectionEffect[]
): Map<string, DutyRosterCorrectionEffect> {
	return new Map(corrections.map((correction) => [correction.runRowDate, correction]));
}

export function effectiveDutyRosterAssigneeId(input: {
	runRowDate: string;
	acceptedAssigneeId: string | null;
	corrections: DutyRosterCorrectionEffect[];
}): string | null {
	return (
		latestDutyRosterCorrectionsByDate(input.corrections).get(input.runRowDate)?.replacementAssigneeId ??
		input.acceptedAssigneeId
	);
}

export function applyDutyRosterCorrectionsToSnapshot(
	snapshot: DutyRosterTemplateAcceptedSnapshot,
	corrections: DutyRosterCorrectionEffect[]
): DutyRosterTemplateAcceptedSnapshot {
	const latest = latestDutyRosterCorrectionsByDate(corrections);
	if (latest.size === 0) {
		return snapshot;
	}
	const finalRows = snapshot.finalRows.map((row) => {
		const correction = latest.get(row.date);
		if (!correction) return row;

		const replacementDisplay =
			snapshot.selectionPersonnel.find((person) => person.id === correction.replacementAssigneeId) ??
			(row.finalDisplay?.id === correction.replacementAssigneeId ? row.finalDisplay : null);
		return {
			...row,
			finalAssigneeId: correction.replacementAssigneeId,
			finalDisplay: replacementDisplay,
			reason: correction.reason
		};
	});
	const da6 = buildCorrectedDa6(snapshot, finalRows);
	return {
		...snapshot,
		finalRows,
		da6,
		exportModel: {
			...snapshot.exportModel,
			rosterRows: finalRows.map((row) => ({
				date: row.date,
				assigneeId: row.finalAssigneeId,
				...(row.reason ? { reason: row.reason } : {})
			})),
			da6
		}
	};
}

function buildCorrectedDa6(
	snapshot: DutyRosterTemplateAcceptedSnapshot,
	finalRows: DutyRosterTemplateAcceptedSnapshot['finalRows']
): Da6Matrix {
	const finalAssigneeByDate = new Map(finalRows.map((row) => [row.date, row.finalAssigneeId]));
	const baseRows = snapshot.da6.rows.map((row) => ({
		...row,
		display: { ...row.display },
		cells: row.cells.map((cell) => finalDa6Cell(cell, row.personnelId, finalAssigneeByDate))
	}));
	const existingPersonnelIds = new Set(baseRows.map((row) => row.personnelId));
	const missingFinalAssigneeIds = [
		...new Set(
			finalRows
				.map((row) => row.finalAssigneeId)
				.filter(
					(assigneeId): assigneeId is string => typeof assigneeId === 'string' && !existingPersonnelIds.has(assigneeId)
				)
		)
	];
	const originallyAssignedCellByDate = new Map(
		snapshot.da6.rows.flatMap((row) => row.cells.filter((cell) => cell.assigned).map((cell) => [cell.date, cell]))
	);

	return {
		...snapshot.da6,
		columns: snapshot.da6.columns.map((column) => ({ ...column, specialDayIds: [...column.specialDayIds] })),
		rows: [
			...baseRows,
			...missingFinalAssigneeIds.flatMap((assigneeId) => {
				const display =
					snapshot.selectionPersonnel.find((person) => person.id === assigneeId) ??
					finalRows.find((row) => row.finalDisplay?.id === assigneeId)?.finalDisplay ??
					null;
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
						cells: snapshot.da6.columns.map((column) => {
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
