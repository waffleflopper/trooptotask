import type { DutyRosterContinuationHistoryItem } from '$features/duty-roster/run/dutyRosterRun.types';
import { applyDutyRosterCorrectionsToSnapshot } from './dutyRosterCorrection';
import type { DutyRosterTemplateAcceptedSnapshot } from './dutyRosterTemplatePreview';
import type {
	DutyRosterPoolPersonnel,
	DutyRosterPoolPersonnelDisplay,
	DutyRosterTemplate,
	DutyRosterTemplateFutureRunConflict,
	DutyRosterTemplateCountReadModel,
	DutyRosterTemplateCountRow
} from './dutyRosterTemplates';

export type DutyRosterCountSourceCorrection = {
	runRowDate: string;
	replacementAssigneeId: string;
	reason: string;
};

export type DutyRosterCountSourceRun = {
	id: string;
	status: 'accepted' | 'invalidated';
	acceptedAt: string;
	snapshot: DutyRosterTemplateAcceptedSnapshot;
	corrections: DutyRosterCountSourceCorrection[];
};

export type DutyRosterCountSourceModel = DutyRosterTemplateCountReadModel & {
	continuationHistory: DutyRosterContinuationHistoryItem[];
	futureRunConflict: DutyRosterTemplateFutureRunConflict | null;
};

export function buildDutyRosterCountSource(input: {
	template: DutyRosterTemplate;
	resolvedPool: DutyRosterPoolPersonnel[];
	runs: DutyRosterCountSourceRun[];
	baselineStartDate?: string;
	previewStartDate?: string;
	previewEndDate?: string;
}): DutyRosterCountSourceModel {
	const runs = [...input.runs].sort(compareRunsByDutyWindow);
	const continuationRuns = input.previewStartDate
		? runs.filter((run) => run.snapshot.config.endDate < input.previewStartDate!)
		: runs;
	const futureRunConflict =
		input.previewStartDate && input.previewEndDate
			? buildFutureRunConflict(runs, {
					previewStartDate: input.previewStartDate,
					previewEndDate: input.previewEndDate
				})
			: null;
	const acceptedRunPersonnelIds = new Set(
		continuationRuns
			.filter((run) => run.status === 'accepted')
			.flatMap((run) => dutyRosterAcceptedSnapshotPersonnelIds(run.snapshot))
	);
	const continuationHistory = continuationRuns
		.filter((run) => run.status === 'accepted')
		.map((run) => applyDutyRosterCorrectionsToSnapshot(run.snapshot, run.corrections))
		.map((snapshot) => acceptedSnapshotToContinuationHistory(snapshot));
	const acceptedRunCount = continuationRuns.filter((run) => run.status === 'accepted').length;
	const invalidatedRunCount = runs.filter((run) => run.status === 'invalidated').length;
	const countingCorrectionCount = continuationRuns
		.filter((run) => run.status === 'accepted')
		.reduce((total, run) => total + run.corrections.length, 0);
	const nonCountingCorrectionCount = runs
		.filter((run) => run.status === 'invalidated')
		.reduce((total, run) => total + run.corrections.length, 0);
	const hasAcceptedOfficialRunHistory = acceptedRunCount > 0;
	const hasBaselineCounts = Object.values(input.template.manualBaselineCounts).some((count) => count > 0);
	const source: DutyRosterTemplateCountReadModel['source'] = hasAcceptedOfficialRunHistory
		? 'accepted-history'
		: hasBaselineCounts
			? 'manual-da6-baseline'
			: 'da6-roster-order';
	const effectiveHistory =
		source === 'accepted-history'
			? continuationHistory
			: source === 'manual-da6-baseline' && input.baselineStartDate
				? buildBaselineContinuationHistory(input.template, input.resolvedPool, input.baselineStartDate)
				: [];
	const rows =
		source === 'accepted-history'
			? countRowsFromHistory(continuationHistory, input.resolvedPool, acceptedRunPersonnelIds)
			: source === 'manual-da6-baseline'
				? countRowsFromBaseline(input.template, input.resolvedPool)
				: zeroCountRows(input.resolvedPool);
	const text = countSourceText({ source, invalidatedRunCount, countingCorrectionCount });

	return {
		templateId: input.template.id,
		source,
		...text,
		rows,
		acceptedRunCount,
		invalidatedRunCount,
		countingCorrectionCount,
		nonCountingCorrectionCount,
		continuationHistory: effectiveHistory,
		futureRunConflict
	};
}

function compareRunsByDutyWindow(left: DutyRosterCountSourceRun, right: DutyRosterCountSourceRun): number {
	const startDiff = left.snapshot.config.startDate.localeCompare(right.snapshot.config.startDate);
	if (startDiff !== 0) return startDiff;

	const endDiff = left.snapshot.config.endDate.localeCompare(right.snapshot.config.endDate);
	if (endDiff !== 0) return endDiff;

	const acceptedDiff = left.acceptedAt.localeCompare(right.acceptedAt);
	if (acceptedDiff !== 0) return acceptedDiff;

	return left.id.localeCompare(right.id);
}

function buildFutureRunConflict(
	runs: DutyRosterCountSourceRun[],
	input: { previewStartDate: string; previewEndDate: string }
): DutyRosterTemplateFutureRunConflict | null {
	const affectedRuns = runs
		.filter((run) => run.status === 'accepted')
		.filter((run) => run.snapshot.config.endDate >= input.previewStartDate)
		.sort(compareRunsByDutyWindow);
	if (affectedRuns.length === 0) {
		return null;
	}

	const first = affectedRuns[0]!;
	const latestEndDate = affectedRuns.reduce(
		(latest, run) => (run.snapshot.config.endDate > latest ? run.snapshot.config.endDate : latest),
		first.snapshot.config.endDate
	);
	return {
		code: 'future-accepted-runs',
		affectedRunCount: affectedRuns.length,
		firstAffectedRunId: first.id,
		firstAffectedRunStartDate: first.snapshot.config.startDate,
		firstAffectedRunEndDate: first.snapshot.config.endDate,
		latestAffectedRunEndDate: latestEndDate,
		message: `This preview starts before ${affectedRuns.length === 1 ? 'an accepted run' : `${affectedRuns.length} accepted runs`} already on this template. Accepting it can change the DA6 counts those later runs should have used.`
	};
}

function countSourceText(input: {
	source: DutyRosterTemplateCountReadModel['source'];
	invalidatedRunCount: number;
	countingCorrectionCount: number;
}): Pick<DutyRosterTemplateCountReadModel, 'sourceLabel' | 'sourceDescription'> {
	switch (input.source) {
		case 'accepted-history':
			return {
				sourceLabel: 'Accepted history',
				sourceDescription: [
					'Future previews use accepted, non-invalidated Duty Roster history.',
					'Manual accepted selections are treated as the final selection.',
					input.countingCorrectionCount > 0 ? 'Latest counting corrections use the Soldier who actually served.' : null,
					input.invalidatedRunCount > 0 ? 'Invalidated runs stay visible in History but do not affect counts.' : null
				]
					.filter((part): part is string => Boolean(part))
					.join(' ')
			};
		case 'manual-da6-baseline':
			return {
				sourceLabel: 'Manual DA6 Baseline',
				sourceDescription:
					'Future previews use Manual DA6 Baseline until this template has its first accepted Duty Roster Run.'
			};
		case 'da6-roster-order':
			return {
				sourceLabel: 'DA6 roster order',
				sourceDescription:
					'Future previews use DA6 roster order because this template has no accepted history or Manual DA6 Baseline counts.'
			};
	}
}

function countRowsFromHistory(
	history: DutyRosterContinuationHistoryItem[],
	resolvedPool: DutyRosterPoolPersonnel[],
	acceptedRunPersonnelIds: Set<string>
): DutyRosterTemplateCountRow[] {
	const rowsById = new Map<string, DutyRosterTemplateCountRow>(
		resolvedPool.map((person) => [
			person.id,
			{
				personnelId: person.id,
				display: poolDisplay(person),
				count: 0,
				lastDutyDate: null,
				appearedInAcceptedRun: acceptedRunPersonnelIds.has(person.id)
			}
		])
	);

	for (const historyItem of history) {
		for (const row of historyItem.roster) {
			if (!row.assigneeId) continue;

			const existing = rowsById.get(row.assigneeId) ?? {
				personnelId: row.assigneeId,
				display: row.assigneeName
					? {
							id: row.assigneeId,
							rank: row.assigneeRank ?? '',
							lastName: row.assigneeName.split(',')[0]?.trim() ?? row.assigneeName,
							firstName: row.assigneeName.split(',')[1]?.trim() ?? '',
							groupName: row.assigneeGroup ?? ''
						}
					: null,
				count: 0,
				lastDutyDate: null,
				appearedInAcceptedRun: acceptedRunPersonnelIds.has(row.assigneeId)
			};
			rowsById.set(row.assigneeId, {
				...existing,
				count: existing.count + 1,
				lastDutyDate: !existing.lastDutyDate || row.date > existing.lastDutyDate ? row.date : existing.lastDutyDate,
				appearedInAcceptedRun: true
			});
		}
	}

	return [...rowsById.values()].sort(compareCountRows);
}

function countRowsFromBaseline(
	template: DutyRosterTemplate,
	resolvedPool: DutyRosterPoolPersonnel[]
): DutyRosterTemplateCountRow[] {
	return resolvedPool
		.map((person) => ({
			personnelId: person.id,
			display: poolDisplay(person),
			count: template.manualBaselineCounts[person.id] ?? 0,
			lastDutyDate: null,
			appearedInAcceptedRun: false
		}))
		.sort(compareCountRows);
}

function zeroCountRows(resolvedPool: DutyRosterPoolPersonnel[]): DutyRosterTemplateCountRow[] {
	return resolvedPool
		.map((person) => ({
			personnelId: person.id,
			display: poolDisplay(person),
			count: 0,
			lastDutyDate: null,
			appearedInAcceptedRun: false
		}))
		.sort(compareCountRows);
}

export function dutyRosterAcceptedSnapshotPersonnelIds(snapshot: DutyRosterTemplateAcceptedSnapshot): string[] {
	return [
		...new Set([
			...snapshot.resolvedPool.map((person) => person.id),
			...snapshot.generatedRows.map((row) => row.assigneeId).filter((id): id is string => Boolean(id)),
			...snapshot.finalRows
				.flatMap((row) => [row.generatedAssigneeId, row.finalAssigneeId])
				.filter((id): id is string => Boolean(id))
		])
	].sort((left, right) => left.localeCompare(right));
}

function buildBaselineContinuationHistory(
	template: DutyRosterTemplate,
	resolvedPool: DutyRosterPoolPersonnel[],
	startDate: string
): DutyRosterContinuationHistoryItem[] {
	const counts = Object.entries(template.manualBaselineCounts)
		.filter(([personnelId, count]) => count > 0 && resolvedPool.some((person) => person.id === personnelId))
		.sort(([left], [right]) => left.localeCompare(right));
	if (counts.length === 0) {
		return [];
	}

	const highestCount = Math.max(...counts.map(([, count]) => count));
	return [
		{
			assignmentTypeId: template.assignmentTypeId,
			startDate: shiftDate(startDate, -highestCount),
			endDate: shiftDate(startDate, -1),
			roster: counts.map(([personnelId, count]) => {
				const person = resolvedPool.find((candidate) => candidate.id === personnelId);
				return {
					date: shiftDate(startDate, -(highestCount - count + 1)),
					assigneeId: personnelId,
					assigneeName: person ? `${person.lastName}, ${person.firstName}` : null,
					assigneeRank: person?.rank ?? null,
					assigneeGroup: person?.groupName ?? null
				};
			}),
			config: {
				historySource: 'manual-da6-baseline',
				manualBaselineCounts: template.manualBaselineCounts
			}
		}
	];
}

function acceptedSnapshotToContinuationHistory(
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
			historySource: 'accepted-duty-roster-run',
			da6ContinuationCounts: buildDa6ContinuationCounts(snapshot)
		}
	};
}

function buildDa6ContinuationCounts(
	snapshot: DutyRosterTemplateAcceptedSnapshot
): Record<string, Record<string, number>> {
	const counts: Record<string, Record<string, number>> = {};
	const finalAssigneeByDate = new Map(snapshot.finalRows.map((row) => [row.date, row.finalAssigneeId]));

	for (const [columnIndex, column] of snapshot.da6.columns.entries()) {
		for (const row of snapshot.da6.rows) {
			const cell = row.cells[columnIndex];
			if (!cell || cell.sequenceNumber === null) {
				continue;
			}

			const finalAssigned = finalAssigneeByDate.get(column.date) === row.personnelId;
			const nextCount = finalAssigned ? 1 : cell.chargeable ? cell.sequenceNumber + 1 : cell.sequenceNumber;
			if (!Number.isInteger(nextCount) || nextCount <= 0) {
				continue;
			}

			counts[row.personnelId] = {
				...(counts[row.personnelId] ?? {}),
				[column.sequenceKey]: nextCount
			};
		}
	}

	return counts;
}

function poolDisplay(person: DutyRosterPoolPersonnel): DutyRosterPoolPersonnelDisplay {
	return {
		id: person.id,
		rank: person.rank,
		lastName: person.lastName,
		firstName: person.firstName,
		groupName: person.groupName
	};
}

function compareCountRows(left: DutyRosterTemplateCountRow, right: DutyRosterTemplateCountRow): number {
	const leftLast = left.display?.lastName ?? '';
	const rightLast = right.display?.lastName ?? '';
	const lastNameComparison = leftLast.localeCompare(rightLast);
	if (lastNameComparison !== 0) return lastNameComparison;

	const leftFirst = left.display?.firstName ?? '';
	const rightFirst = right.display?.firstName ?? '';
	const firstNameComparison = leftFirst.localeCompare(rightFirst);
	if (firstNameComparison !== 0) return firstNameComparison;

	return left.personnelId.localeCompare(right.personnelId);
}

function shiftDate(value: string, offsetDays: number): string {
	const [yearValue, monthValue, dayValue] = value.split('-').map(Number);
	const date = new Date(Date.UTC(yearValue, monthValue - 1, dayValue + offsetDays));
	const year = date.getUTCFullYear();
	const month = String(date.getUTCMonth() + 1).padStart(2, '0');
	const day = String(date.getUTCDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}
