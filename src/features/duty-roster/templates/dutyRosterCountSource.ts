import type { DutyRosterContinuationHistoryItem } from '$features/duty-roster/run/dutyRosterRun.types';
import { applyDutyRosterCorrectionsToSnapshot } from './dutyRosterCorrection';
import type { DutyRosterTemplateAcceptedSnapshot } from './dutyRosterTemplatePreview';
import type {
	DutyRosterPoolPersonnel,
	DutyRosterPoolPersonnelDisplay,
	DutyRosterTemplate,
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
};

export function buildDutyRosterCountSource(input: {
	template: DutyRosterTemplate;
	resolvedPool: DutyRosterPoolPersonnel[];
	runs: DutyRosterCountSourceRun[];
	baselineStartDate?: string;
}): DutyRosterCountSourceModel {
	const runs = [...input.runs].sort((left, right) => left.acceptedAt.localeCompare(right.acceptedAt));
	const continuationHistory = runs
		.filter((run) => run.status === 'accepted')
		.map((run) => applyDutyRosterCorrectionsToSnapshot(run.snapshot, run.corrections))
		.map((snapshot) => acceptedSnapshotToContinuationHistory(snapshot));
	const acceptedRunCount = runs.filter((run) => run.status === 'accepted').length;
	const invalidatedRunCount = runs.filter((run) => run.status === 'invalidated').length;
	const countingCorrectionCount = runs
		.filter((run) => run.status === 'accepted')
		.reduce((total, run) => total + run.corrections.length, 0);
	const nonCountingCorrectionCount = runs
		.filter((run) => run.status === 'invalidated')
		.reduce((total, run) => total + run.corrections.length, 0);
	const hasOfficialRunHistory = runs.length > 0;
	const hasBaselineCounts = Object.values(input.template.manualBaselineCounts).some((count) => count > 0);
	const source: DutyRosterTemplateCountReadModel['source'] = hasOfficialRunHistory
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
			? countRowsFromHistory(continuationHistory, input.resolvedPool)
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
		continuationHistory: effectiveHistory
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
	resolvedPool: DutyRosterPoolPersonnel[]
): DutyRosterTemplateCountRow[] {
	const rowsById = new Map<string, DutyRosterTemplateCountRow>(
		resolvedPool.map((person) => [
			person.id,
			{
				personnelId: person.id,
				display: poolDisplay(person),
				count: 0,
				lastDutyDate: null
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
				lastDutyDate: null
			};
			rowsById.set(row.assigneeId, {
				...existing,
				count: existing.count + 1,
				lastDutyDate: !existing.lastDutyDate || row.date > existing.lastDutyDate ? row.date : existing.lastDutyDate
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
			lastDutyDate: null
		}))
		.sort(compareCountRows);
}

function zeroCountRows(resolvedPool: DutyRosterPoolPersonnel[]): DutyRosterTemplateCountRow[] {
	return resolvedPool
		.map((person) => ({
			personnelId: person.id,
			display: poolDisplay(person),
			count: 0,
			lastDutyDate: null
		}))
		.sort(compareCountRows);
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
				historySource: 'manual-da6-baseline'
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
			historySource: 'accepted-duty-roster-run'
		}
	};
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
