import type { Personnel } from '$lib/types';
import { buildCriticalTasksSoldierReadinessSummary } from '../utils/ictReadinessSnapshot';
import { PersonnelIctCompletionEntity } from './personnelIctCompletionEntity.server';
import { listActiveIctTasksForReadiness } from './ictTaskRead.server';
import { fetchCriticalTasksSettings } from './criticalTasksSettingsRead.server';

interface CriticalTasksReadinessLane {
	label: 'Critical Tasks';
	value: string;
	detail: string;
	tone: 'good' | 'watch' | 'bad' | 'neutral';
}
interface CriticalTasksReadinessInput {
	store: Parameters<typeof listActiveIctTasksForReadiness>[0]['store'] &
		Parameters<typeof fetchCriticalTasksSettings>[0]['store'];
	orgId: string;
	personnelId: string;
	asOf?: string | Date;
	/** Delivery supplies the Person after existing Critical Tasks and Group authorization. */
	loadAuthorizedPerson: () => Promise<Personnel>;
}
function plural(count: number, singular: string): string {
	return `${count} ${count === 1 ? singular : `${singular}s`}`;
}

/** Critical Tasks owns its source lookups and projection; delivery retains admission. */
export async function loadCriticalTasksReadinessLane({
	store,
	orgId,
	personnelId,
	asOf,
	loadAuthorizedPerson
}: CriticalTasksReadinessInput): Promise<CriticalTasksReadinessLane> {
	const person = await loadAuthorizedPerson();
	const [tasks, completionRows, settings] = await Promise.all([
		listActiveIctTasksForReadiness({ store, orgId }),
		store.findMany<Record<string, unknown>>(
			'personnel_ict_completions',
			orgId,
			{ personnel_id: personnelId },
			{ select: PersonnelIctCompletionEntity.select }
		),
		fetchCriticalTasksSettings({ auth: { orgId }, store })
	]);
	const completions = PersonnelIctCompletionEntity.fromDbArray(completionRows);
	const readiness = buildCriticalTasksSoldierReadinessSummary({
		person,
		activeTasks: tasks,
		completions,
		settings,
		asOf
	});

	if (readiness.applicableCount === 0) {
		return {
			label: 'Critical Tasks',
			value: 'No tasks',
			detail: 'No applicable ICT tasks for this Soldier.',
			tone: 'neutral'
		};
	}

	const expiringSoonDetail =
		readiness.expiringSoonCount > 0 ? ` ${plural(readiness.expiringSoonCount, 'task')} expiring soon.` : '';
	const attentionDetail =
		readiness.attentionCount > 0
			? ` ${plural(readiness.attentionCount, 'task')} ${readiness.attentionCount === 1 ? 'needs' : 'need'} attention.`
			: ' No tasks need attention.';
	const tone =
		readiness.readinessPercent < 70
			? 'bad'
			: readiness.readinessPercent < 90 || readiness.expiringSoonCount > 0
				? 'watch'
				: 'good';

	return {
		label: 'Critical Tasks',
		value: `${readiness.readinessPercent}%`,
		detail: `${readiness.readyCount} of ${readiness.applicableCount} applicable ICT tasks ready.${expiringSoonDetail}${attentionDetail}`,
		tone
	};
}
