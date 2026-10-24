import type { SupabaseClient } from '@supabase/supabase-js';
import type { RosterSourceQuery, RosterSourceRead } from '$features/personnel/contracts';
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

/** Each visible active Person's applicable critical tasks, from the newest validation per task, in one statement. */
export function createSupabaseCriticalTaskRosterSignals(client: SupabaseClient, orgId: string) {
	return async ({
		asOf,
		personnelIds
	}: RosterSourceQuery): Promise<RosterSourceRead<PersonnelCriticalTaskReadiness<IctCompletionFacts>>> => {
		const { data, error } = await client.rpc('roster_signal_critical_tasks', {
			p_organization_id: orgId,
			p_personnel_ids: personnelIds
		});
		if (error) throw new Error(error.message);
		const read = data as {
			cohort: [id: string, mos: string][];
			tasks: TaskRow[];
			settings: { defaultExpirationMonths: number | null; expiringSoonWarningDays: number | null } | null;
			completions: CompletionTuple[];
		};
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
			completions.set(personnelId, [
				...(completions.get(personnelId) ?? []),
				{ ictTaskId, completedAt, createdAt, validatedBy }
			]);
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
