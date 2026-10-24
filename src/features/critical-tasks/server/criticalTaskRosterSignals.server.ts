import type { RosterSignalSlices, RosterSourceQuery, RosterSourceRead } from '$features/personnel/contracts';
import { normalizeCriticalTasksSettings } from '../utils/ictStatus';
import {
	buildPersonnelCriticalTaskReadiness,
	type IctCompletionFacts,
	type IctTaskFacts,
	type PersonnelCriticalTaskReadiness
} from '../utils/personnelCriticalTaskItems';

type CompletionTuple = [
	personnelId: string,
	ictTaskId: string,
	completedAt: string,
	createdAt: string,
	validatedBy: string | null
];

type TaskRow = { id: string; task_code: string; title: string; mos: string[] | null; expiration_months: number | null };

export function createSupabaseCriticalTaskRosterSignals(slices: RosterSignalSlices) {
	return async (
		query: RosterSourceQuery
	): Promise<RosterSourceRead<PersonnelCriticalTaskReadiness<IctCompletionFacts>>> => {
		const read = (await slices('criticalTasks', query)) as {
			cohort: [id: string, mos: string][];
			tasks: TaskRow[];
			settings: { defaultExpirationMonths: number | null; expiringSoonWarningDays: number | null } | null;
			completions: CompletionTuple[];
		};
		const { asOf } = query;
		const tasks = read.tasks.map(
			(task): IctTaskFacts => ({
				id: task.id,
				taskCode: task.task_code,
				title: task.title,
				mos: task.mos ?? [],
				expirationMonths: task.expiration_months
			})
		);
		const settings = normalizeCriticalTasksSettings(read.settings);
		const completions = new Map<string, IctCompletionFacts[]>();
		for (const [personnelId, ictTaskId, completedAt, createdAt, validatedBy] of read.completions) {
			const facts = { ictTaskId, completedAt, createdAt, validatedBy };
			const own = completions.get(personnelId);
			if (own) own.push(facts);
			else completions.set(personnelId, [facts]);
		}
		return new Map(
			read.cohort.map(([id, mos]) => [
				id,
				buildPersonnelCriticalTaskReadiness({
					person: { id, mos },
					tasks,
					completions: completions.get(id) ?? [],
					settings,
					asOf
				})
			])
		);
	};
}
