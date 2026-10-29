import type {
	CriticalTasksSettingsInput,
	IctStatus,
	IctStatusInfo,
	IctTask,
	PersonnelIctCompletion
} from '$features/critical-tasks/criticalTasks.types';
import type { Group } from '$features/personnel/contracts';
import type { Personnel } from '$features/personnel/contracts';
import {
	buildGroupTree,
	createRosterReadModel,
	nestRosterBands,
	rosterGroupFilterValue
} from '$features/personnel/contracts';
import { getIctStatus } from './ictStatus';
import { buildLatestIctCompletionLookup, ictCompletionKey, isCriticalTaskStatusReady } from './ictReadinessSnapshot';
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
	/** The Group's own name below a top band. */
	label: string;
	/** 0 for a top band, then 1 and 2 for the sub-groups below it. */
	level: number;
	/** The band's own people; its sub-groups' people follow in their own bands. */
	rows: CriticalTasksMatrixRow[];
	/** Everyone in the band's Group and its sub-groups. */
	personnelCount: number;
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
	pinnedGroupIds?: readonly string[];
	settings?: CriticalTasksSettingsInput | null;
	selectedGroupId?: string;
	selectedGroupFilter?: string;
	gapsOnly?: boolean;
	/** False rolls each top-level Group's subtree into one band. */
	showSubGroups?: boolean;
	asOf?: string | Date;
	orgName?: string;
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
	pinnedGroupIds = [],
	settings = null,
	selectedGroupId = '',
	selectedGroupFilter = '',
	gapsOnly = false,
	showSubGroups = true,
	asOf,
	orgName = 'Unassigned'
}: BuildCriticalTasksMatrixOptions): CriticalTasksMatrix {
	const activeTasks = getActiveIctTasksForLibrary(tasks);
	// The matrix shows the latest saved capture; asOf only evaluates its status.
	const latestCompletions = buildLatestIctCompletionLookup(completions);
	const sections = createRosterReadModel({
		personnel,
		groups,
		pinnedGroupIds,
		fallbackGroupName: orgName
	}).full({
		status: 'active',
		groupFilter: selectedGroupFilter || selectedGroupId || undefined
	}).personnelByGroup;
	const bands = nestRosterBands(buildGroupTree(groups, { pinnedIds: pinnedGroupIds }), sections, showSubGroups);

	const rowFor = (person: Personnel): CriticalTasksMatrixRow => {
		let readyCount = 0;
		let applicableCount = 0;
		const cells = activeTasks.map((task) => {
			const applicable = isIctTaskApplicableToMos(task, person.mos);
			const completion = applicable ? latestCompletions.get(ictCompletionKey(person.id, task.id)) : undefined;
			const statusInfo = getIctStatus(completion?.completedAt ?? null, task, settings, asOf);
			const isGap = applicable && (statusInfo.status === 'expired' || statusInfo.status === 'not-recorded');
			const detailLabel = buildDetailLabel(task, completion, statusInfo);
			if (applicable) {
				applicableCount += 1;
				if (isCriticalTaskStatusReady(statusInfo.status)) {
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

		return {
			person,
			cells,
			cellsByTaskId: buildCellLookup(cells),
			hasGap: cells.some((cell) => cell.isGap),
			readinessPercent: readinessPercent(readyCount, applicableCount),
			readyCount,
			applicableCount
		};
	};
	const rowsByPerson = new Map(bands.flatMap((band) => band.personnel).map((person) => [person.id, rowFor(person)]));

	// A band's header counts its whole subtree, so a Group with only sub-group people still heads them.
	const groupsOf = (keep: (row: CriticalTasksMatrixRow) => CriticalTasksMatrixRow | null) =>
		bands.flatMap((band): CriticalTasksMatrixGroup[] => {
			const pick = (people: Personnel[]) => people.flatMap((person) => keep(rowsByPerson.get(person.id)!) ?? []);
			const subtree = pick(band.people);
			if (subtree.length === 0) return [];
			const readyCount = subtree.reduce((total, row) => total + row.readyCount, 0);
			const applicableCount = subtree.reduce((total, row) => total + row.applicableCount, 0);
			return [
				{
					key: rosterGroupFilterValue(band),
					label: band.name,
					level: band.level,
					rows: pick(band.personnel),
					personnelCount: subtree.length,
					readinessPercent: readinessPercent(readyCount, applicableCount),
					readyCount,
					applicableCount
				}
			];
		});

	if (gapsOnly) {
		const gapTaskIds = new Set<string>();
		for (const row of rowsByPerson.values()) {
			for (const cell of row.cells) {
				if (cell.isGap) gapTaskIds.add(cell.task.id);
			}
		}

		const gapGroups = groupsOf((row) => {
			if (!row.hasGap) return null;
			const cells = row.cells.filter((cell) => gapTaskIds.has(cell.task.id));
			return { ...row, cells, cellsByTaskId: buildCellLookup(cells) };
		});
		const gapRows = gapGroups.flatMap((group) => group.rows);

		return {
			tasks: activeTasks.filter((task) => gapTaskIds.has(task.id)),
			rows: gapRows,
			alphabeticalRows: [...gapRows].sort((a, b) => comparePersonnelAlphabetically(a.person, b.person)),
			groups: gapGroups
		};
	}

	const allGroups = groupsOf((row) => row);
	const allRows = allGroups.flatMap((group) => group.rows);
	return {
		tasks: activeTasks,
		rows: allRows,
		alphabeticalRows: [...allRows].sort((a, b) => comparePersonnelAlphabetically(a.person, b.person)),
		groups: allGroups
	};
}
