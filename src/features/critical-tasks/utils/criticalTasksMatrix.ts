import type {
	CriticalTasksSettingsInput,
	IctStatus,
	IctStatusInfo,
	IctTask,
	PersonnelIctCompletion
} from '$features/critical-tasks/criticalTasks.types';
import type { Group } from '$features/personnel/contracts';
import type { Personnel } from '$lib/types';
import { createRosterReadModel } from '$features/personnel/contracts';
import { getIctStatus } from './ictStatus';
import { getActiveIctTasksForLibrary, isIctTaskApplicableToMos } from './ictTaskLibrary';

export interface CriticalTasksMatrixCell {
	task: IctTask;
	applicable: boolean;
	completion: PersonnelIctCompletion | undefined;
	statusInfo: IctStatusInfo;
	detailLabel: string;
	isGap: boolean;
}

export interface CriticalTasksMatrixRow {
	person: Personnel;
	cells: CriticalTasksMatrixCell[];
	cellsByTaskId: Map<string, CriticalTasksMatrixCell>;
	hasGap: boolean;
	readinessPercent: number;
	readyCount: number;
	applicableCount: number;
}

export interface CriticalTasksMatrixGroup {
	key: string;
	label: string;
	rows: CriticalTasksMatrixRow[];
	readinessPercent: number;
	readyCount: number;
	applicableCount: number;
}

export interface CriticalTasksMatrix {
	tasks: IctTask[];
	rows: CriticalTasksMatrixRow[];
	alphabeticalRows: CriticalTasksMatrixRow[];
	groups: CriticalTasksMatrixGroup[];
}

export interface BuildCriticalTasksMatrixOptions {
	personnel: Personnel[];
	tasks: IctTask[];
	completions: PersonnelIctCompletion[];
	groups?: Group[];
	settings?: CriticalTasksSettingsInput | null;
	selectedGroupId?: string;
	selectedGroupFilter?: string;
	gapsOnly?: boolean;
	asOf?: string | Date;
	orgName?: string;
}

function completionKey(personnelId: string, ictTaskId: string): string {
	return `${personnelId}:${ictTaskId}`;
}

function compareCompletionRecency(a: PersonnelIctCompletion, b: PersonnelIctCompletion): number {
	const completedAtDiff = a.completedAt.localeCompare(b.completedAt);
	if (completedAtDiff !== 0) return completedAtDiff;
	return a.createdAt.localeCompare(b.createdAt);
}

function getLatestCompletionLookup(completions: PersonnelIctCompletion[]): Map<string, PersonnelIctCompletion> {
	const lookup = new Map<string, PersonnelIctCompletion>();

	for (const completion of completions) {
		const key = completionKey(completion.personnelId, completion.ictTaskId);
		const existing = lookup.get(key);
		if (!existing || compareCompletionRecency(existing, completion) < 0) {
			lookup.set(key, completion);
		}
	}

	return lookup;
}

const statusLabels: Record<IctStatus, string> = {
	current: 'current',
	'expiring-soon': 'expiring soon',
	expired: 'expired',
	'not-recorded': 'not recorded'
};

function buildDetailLabel(
	task: IctTask,
	completion: PersonnelIctCompletion | undefined,
	statusInfo: IctStatusInfo
): string {
	const statusLabel = statusLabels[statusInfo.status];
	if (!completion) {
		return `${task.title}: ${statusLabel}. No completion recorded.`;
	}

	const parts = [`${task.title}: ${statusLabel}.`, `Completed ${completion.completedAt}.`];
	if (statusInfo.expirationDate) {
		parts.push(`Expires ${statusInfo.expirationDate}.`);
	}
	if (completion.validatedBy) {
		parts.push(`Validated by ${completion.validatedBy} via ${completion.validationMethod}.`);
	} else {
		parts.push(`Validated via ${completion.validationMethod}.`);
	}

	return parts.join(' ');
}

function comparePersonnelAlphabetically(a: Personnel, b: Personnel): number {
	return a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName);
}

function readinessPercent(readyCount: number, applicableCount: number): number {
	return applicableCount === 0 ? 0 : Math.round((readyCount / applicableCount) * 100);
}

function buildCellLookup(cells: CriticalTasksMatrixCell[]): Map<string, CriticalTasksMatrixCell> {
	return new Map(cells.map((cell) => [cell.task.id, cell]));
}

function normalizeSearchTerm(value: string): string {
	return value.trim().toLowerCase();
}

export function matchesCriticalTasksPersonnelSearch(
	person: Pick<Personnel, 'rank' | 'lastName' | 'firstName' | 'mos'>,
	query: string
): boolean {
	const normalizedQuery = normalizeSearchTerm(query);
	if (!normalizedQuery) return true;

	return [
		person.rank,
		person.mos,
		person.lastName,
		person.firstName,
		`${person.lastName}, ${person.firstName}`,
		`${person.firstName} ${person.lastName}`
	]
		.map((value) => normalizeSearchTerm(value))
		.some((value) => value.includes(normalizedQuery));
}

export function buildCriticalTasksMatrix({
	personnel,
	tasks,
	completions,
	groups = [],
	settings = null,
	selectedGroupId = '',
	selectedGroupFilter = '',
	gapsOnly = false,
	asOf,
	orgName = 'Unassigned'
}: BuildCriticalTasksMatrixOptions): CriticalTasksMatrix {
	const activeTasks = getActiveIctTasksForLibrary(tasks);
	const latestCompletions = getLatestCompletionLookup(completions);
	const groupOrder = [...groups]
		.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name))
		.map((g) => g.name);
	const sortedGroups = createRosterReadModel({
		personnel,
		groupOrder,
		fallbackGroupName: orgName
	}).full({
		status: 'active',
		groupId: selectedGroupFilter ? undefined : selectedGroupId || undefined,
		groupFilter: selectedGroupFilter || undefined
	}).personnelByGroup;

	const allGroups = sortedGroups
		.map((group) => {
			const rows = group.personnel.map((person) => {
				let readyCount = 0;
				let applicableCount = 0;
				const cells = activeTasks.map((task) => {
					const applicable = isIctTaskApplicableToMos(task, person.mos);
					const completion = applicable ? latestCompletions.get(completionKey(person.id, task.id)) : undefined;
					const statusInfo = getIctStatus(completion?.completedAt ?? null, task, settings, asOf);
					const isGap = applicable && (statusInfo.status === 'expired' || statusInfo.status === 'not-recorded');
					const detailLabel = buildDetailLabel(task, completion, statusInfo);
					if (applicable) {
						applicableCount += 1;
						if (statusInfo.status === 'current' || statusInfo.status === 'expiring-soon') {
							readyCount += 1;
						}
					}

					return {
						task,
						applicable,
						completion,
						statusInfo,
						detailLabel,
						isGap
					};
				});
				const hasGap = cells.some((cell) => cell.isGap);

				return {
					person,
					cells,
					cellsByTaskId: buildCellLookup(cells),
					hasGap,
					readinessPercent: readinessPercent(readyCount, applicableCount),
					readyCount,
					applicableCount
				};
			});
			const groupReadyCount = rows.reduce((total, row) => total + row.readyCount, 0);
			const groupApplicableCount = rows.reduce((total, row) => total + row.applicableCount, 0);

			return {
				key: group.group,
				label: group.group,
				rows,
				readinessPercent: readinessPercent(groupReadyCount, groupApplicableCount),
				readyCount: groupReadyCount,
				applicableCount: groupApplicableCount
			};
		})
		.filter((group) => group.rows.length > 0);
	const allRows = allGroups.flatMap((group) => group.rows);
	const alphabeticalRows = [...allRows].sort((a, b) => comparePersonnelAlphabetically(a.person, b.person));

	if (gapsOnly) {
		const gapTaskIds = new Set<string>();

		for (const group of allGroups) {
			for (const row of group.rows) {
				if (!row.hasGap) continue;

				for (const cell of row.cells) {
					if (cell.isGap) {
						gapTaskIds.add(cell.task.id);
					}
				}
			}
		}

		const gapGroups = allGroups
			.map((group) => {
				const rows = group.rows
					.filter((row) => row.hasGap)
					.map((row) => {
						const cells = row.cells.filter((cell) => gapTaskIds.has(cell.task.id));
						return {
							...row,
							cells,
							cellsByTaskId: buildCellLookup(cells)
						};
					});
				const groupReadyCount = rows.reduce((total, row) => total + row.readyCount, 0);
				const groupApplicableCount = rows.reduce((total, row) => total + row.applicableCount, 0);
				return {
					...group,
					rows,
					readinessPercent: readinessPercent(groupReadyCount, groupApplicableCount),
					readyCount: groupReadyCount,
					applicableCount: groupApplicableCount
				};
			})
			.filter((group) => group.rows.length > 0);
		const gapRows = gapGroups.flatMap((group) => group.rows);

		return {
			tasks: activeTasks.filter((task) => gapTaskIds.has(task.id)),
			rows: gapRows,
			alphabeticalRows: [...gapRows].sort((a, b) => comparePersonnelAlphabetically(a.person, b.person)),
			groups: gapGroups
		};
	}

	return {
		tasks: activeTasks,
		rows: allRows,
		alphabeticalRows,
		groups: allGroups
	};
}
