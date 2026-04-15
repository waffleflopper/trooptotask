import type {
	CriticalTasksSettingsInput,
	IctStatus,
	IctStatusInfo,
	IctTask,
	PersonnelIctCompletion
} from '$features/critical-tasks/criticalTasks.types';
import type { Group } from '$lib/stores/groups.svelte';
import type { Personnel } from '$lib/types';
import { groupAndSortPersonnel } from '$features/personnel/utils/personnelGrouping';
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
	hasGap: boolean;
}

export interface CriticalTasksMatrixGroup {
	key: string;
	label: string;
	rows: CriticalTasksMatrixRow[];
}

export interface CriticalTasksMatrix {
	tasks: IctTask[];
	rows: CriticalTasksMatrixRow[];
	groups: CriticalTasksMatrixGroup[];
}

export interface BuildCriticalTasksMatrixOptions {
	personnel: Personnel[];
	tasks: IctTask[];
	completions: PersonnelIctCompletion[];
	groups?: Group[];
	settings?: CriticalTasksSettingsInput | null;
	selectedGroupId?: string;
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

export function buildCriticalTasksMatrix({
	personnel,
	tasks,
	completions,
	groups = [],
	settings = null,
	selectedGroupId = '',
	gapsOnly = false,
	asOf,
	orgName = 'Unassigned'
}: BuildCriticalTasksMatrixOptions): CriticalTasksMatrix {
	const activeTasks = getActiveIctTasksForLibrary(tasks);
	const latestCompletions = getLatestCompletionLookup(completions);
	const groupOrder = [...groups]
		.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
		.map((g) => g.name);
	const activePersonnel = personnel.filter((person) => !person.archivedAt);
	const scopedPersonnel = selectedGroupId
		? activePersonnel.filter((person) => person.groupId === selectedGroupId)
		: activePersonnel;

	const sortedGroups = groupAndSortPersonnel(scopedPersonnel, {
		groupOrder,
		fallbackGroupName: orgName
	});

	const allGroups = sortedGroups
		.map((group) => {
			const rows = group.personnel.map((person) => {
				const cells = activeTasks.map((task) => {
					const applicable = isIctTaskApplicableToMos(task, person.mos);
					const completion = applicable ? latestCompletions.get(completionKey(person.id, task.id)) : undefined;
					const statusInfo = getIctStatus(completion?.completedAt ?? null, task, settings, asOf);
					const isGap = applicable && (statusInfo.status === 'expired' || statusInfo.status === 'not-recorded');
					const detailLabel = buildDetailLabel(task, completion, statusInfo);

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
					hasGap
				};
			});

			return {
				key: group.group,
				label: group.group,
				rows
			};
		})
		.filter((group) => group.rows.length > 0);

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
			.map((group) => ({
				...group,
				rows: group.rows
					.filter((row) => row.hasGap)
					.map((row) => ({
						...row,
						cells: row.cells.filter((cell) => gapTaskIds.has(cell.task.id))
					}))
			}))
			.filter((group) => group.rows.length > 0);

		return {
			tasks: activeTasks.filter((task) => gapTaskIds.has(task.id)),
			rows: gapGroups.flatMap((group) => group.rows),
			groups: gapGroups
		};
	}

	return {
		tasks: activeTasks,
		rows: allGroups.flatMap((group) => group.rows),
		groups: allGroups
	};
}
