import type { Personnel } from '$features/personnel/contracts';
import { compareReadinessItems, type ReadinessItemStatus } from '$lib/domain/readinessItem';
import type { CriticalTasksSettings, IctStatus, IctTask, PersonnelIctCompletion } from '../criticalTasks.types';
import { compareIctCompletionRecency } from './ictReadinessSnapshot';
import { getIctStatus, resolveIctExpirationMonths } from './ictStatus';
import { isIctTaskApplicableToMos } from './ictTaskLibrary';

export interface PersonnelCriticalTaskItem {
	taskId: string;
	taskCode: string;
	name: string;
	status: ReadinessItemStatus;
	expirationDate: string | null;
	daysUntilExpiration: number | null;
	cycleMonths: number;
	latest: PersonnelIctCompletion | null;
	/** Every recorded validation for the task, newest first; the first is `latest`. */
	history: PersonnelIctCompletion[];
}

export interface PersonnelCriticalTaskReadiness {
	personnelId: string;
	mos: string;
	/** Applicable tasks, ranked expired, missing, expiring, then current by soonest expiry. */
	items: PersonnelCriticalTaskItem[];
	expiringSoonWarningDays: number;
}

const ITEM_STATUS = {
	expired: 'expired',
	'not-recorded': 'missing',
	'expiring-soon': 'expiring',
	current: 'current'
} as const satisfies Record<IctStatus, ReadinessItemStatus>;

export function buildPersonnelCriticalTaskReadiness(input: {
	person: Personnel;
	tasks: IctTask[];
	completions: PersonnelIctCompletion[];
	settings: CriticalTasksSettings;
	asOf: string;
}): PersonnelCriticalTaskReadiness {
	const { person, settings, asOf } = input;
	const historyByTask = new Map<string, PersonnelIctCompletion[]>();
	for (const completion of input.completions.toSorted((a, b) => compareIctCompletionRecency(b, a))) {
		historyByTask.set(completion.ictTaskId, [...(historyByTask.get(completion.ictTaskId) ?? []), completion]);
	}

	const items = input.tasks
		.filter((task) => !task.archivedAt && isIctTaskApplicableToMos(task, person.mos))
		.map((task): PersonnelCriticalTaskItem => {
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
