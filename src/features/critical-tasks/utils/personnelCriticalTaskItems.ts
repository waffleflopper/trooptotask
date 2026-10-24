import type { PersonnelRequirementPerson } from '$features/personnel/contracts';
import { compareReadinessItems, type ReadinessItemStatus } from '$lib/domain/readinessItem';
import type { CriticalTasksSettings, IctStatus, IctTask, PersonnelIctCompletion } from '../criticalTasks.types';
import { compareIctCompletionRecency } from './ictReadinessSnapshot';
import { getIctStatus, resolveIctExpirationMonths } from './ictStatus';
import { isIctTaskApplicableToMos } from './ictTaskLibrary';

export type IctCompletionFacts = Pick<
	PersonnelIctCompletion,
	'ictTaskId' | 'completedAt' | 'createdAt' | 'validatedBy'
>;

export type IctTaskFacts = Pick<IctTask, 'id' | 'taskCode' | 'title' | 'mos' | 'expirationMonths'> & {
	archivedAt?: string | null;
};

export interface PersonnelCriticalTaskItem<C extends IctCompletionFacts = PersonnelIctCompletion> {
	taskId: string;
	taskCode: string;
	name: string;
	status: ReadinessItemStatus;
	expirationDate: string | null;
	daysUntilExpiration: number | null;
	cycleMonths: number;
	latest: C | null;
	/** Every recorded validation for the task, newest first; the first is `latest`. */
	history: C[];
}

export interface PersonnelCriticalTaskReadiness<C extends IctCompletionFacts = PersonnelIctCompletion> {
	personnelId: string;
	mos: string;
	/** Applicable tasks, ranked expired, missing, expiring, then current by soonest expiry. */
	items: PersonnelCriticalTaskItem<C>[];
	expiringSoonWarningDays: number;
}

const ITEM_STATUS = {
	expired: 'expired',
	'not-recorded': 'missing',
	'expiring-soon': 'expiring',
	current: 'current'
} as const satisfies Record<IctStatus, ReadinessItemStatus>;

export function buildPersonnelCriticalTaskReadiness<C extends IctCompletionFacts = PersonnelIctCompletion>(input: {
	person: Pick<PersonnelRequirementPerson, 'id' | 'mos'>;
	tasks: readonly IctTaskFacts[];
	completions: readonly C[];
	settings: CriticalTasksSettings;
	asOf: string;
}): PersonnelCriticalTaskReadiness<C> {
	const { person, settings, asOf } = input;
	const historyByTask = new Map<string, C[]>();
	for (const completion of input.completions.toSorted((a, b) => compareIctCompletionRecency(b, a))) {
		historyByTask.set(completion.ictTaskId, [...(historyByTask.get(completion.ictTaskId) ?? []), completion]);
	}

	const items = input.tasks
		.filter((task) => !task.archivedAt && isIctTaskApplicableToMos(task, person.mos))
		.map((task): PersonnelCriticalTaskItem<C> => {
			const history = historyByTask.get(task.id) ?? [];
			const latest = history[0] ?? null;
			const info = getIctStatus(latest?.completedAt ?? null, task, settings, asOf);
			return {
				taskId: task.id,
				taskCode: task.taskCode,
				name: task.title,
				status: ITEM_STATUS[info.status],
				expirationDate: info.expirationDate,
				daysUntilExpiration: info.daysUntilExpiration,
				cycleMonths: resolveIctExpirationMonths(task, settings),
				latest,
				history
			};
		});

	return {
		personnelId: person.id,
		mos: person.mos,
		items: items.sort(compareReadinessItems),
		expiringSoonWarningDays: settings.expiringSoonWarningDays
	};
}

/** The row's secondary line: the task code, then how and by whom the latest validation was done. */
export function describeCriticalTaskItem(item: PersonnelCriticalTaskItem): string {
	if (!item.latest) return `${item.taskCode} · not recorded`;
	const by = item.latest.validatedBy?.trim();
	return `${item.taskCode} · ${item.latest.validationMethod}${by ? ` by ${by}` : ''}`;
}
