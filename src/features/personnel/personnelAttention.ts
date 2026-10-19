import { isReadinessProblem } from '$lib/domain/readinessItem';
import type {
	AttentionInput,
	AttentionItem,
	AttentionSource,
	AttentionStatus,
	PersonnelAttention
} from './personnelReadiness.types';

const STATUS_RANK: Record<AttentionStatus, number> = { expired: 0, missing: 1, expiring: 2, due: 2, upcoming: 3 };
const DUE_EVALUATION = new Set(['due-60', 'due-30', 'overdue']);

function byUrgency(a: AttentionItem, b: AttentionItem): number {
	return (
		STATUS_RANK[a.status] - STATUS_RANK[b.status] ||
		(a.daysUntilDue ?? Number.POSITIVE_INFINITY) - (b.daysUntilDue ?? Number.POSITIVE_INFINITY) ||
		a.title.localeCompare(b.title)
	);
}

function trainingItems(input: AttentionInput['training']): AttentionItem[] {
	if (!input.ok) return [];
	return input.value.items.flatMap((item) => {
		const status = item.status;
		if (!isReadinessProblem(status)) return [];
		return [
			{
				kind: 'training',
				status,
				id: item.typeId,
				title: item.name,
				detail: item.cycleMonths === null ? 'Does not expire' : `${item.cycleMonths}-month cycle`,
				dueDate: item.completion?.expirationDate ?? null,
				daysUntilDue: item.daysUntilExpiration,
				target: { tab: 'readiness', item: { kind: 'training', id: item.typeId } }
			}
		];
	});
}

function criticalTaskItems(input: AttentionInput['criticalTasks']): AttentionItem[] {
	if (!input.ok) return [];
	return input.value.items.flatMap((item) => {
		const status = item.status;
		if (!isReadinessProblem(status)) return [];
		return [
			{
				kind: 'critical-task',
				status,
				id: item.taskId,
				title: item.name,
				detail: item.taskCode,
				dueDate: item.expirationDate,
				daysUntilDue: item.daysUntilExpiration,
				target: { tab: 'readiness', item: { kind: 'critical-task', id: item.taskId } }
			}
		];
	});
}

function evaluationItems(input: AttentionInput['evaluation']): AttentionItem[] {
	if (!input.ok || !input.value || !DUE_EVALUATION.has(input.value.dueStatus)) return [];
	const entry = input.value;
	return [
		{
			kind: 'evaluation',
			status: 'due',
			id: entry.entryId,
			title: [entry.reportTypeLabel, entry.evalType].filter(Boolean).join(' '),
			detail: entry.phase.label,
			dueDate: entry.periodEnd,
			daysUntilDue: entry.daysUntilThru,
			target: { tab: 'readiness', item: null }
		}
	];
}

function lossItems(input: AttentionInput['loss']): AttentionItem[] {
	if (!input.ok || !input.value.inWindow) return [];
	const { inWindow, windowDays } = input.value;
	return [
		{
			kind: 'loss',
			status: 'upcoming',
			id: inWindow.trigger,
			title: inWindow.trigger,
			detail: `Inside the ${windowDays}-day loss window`,
			dueDate: inWindow.date,
			daysUntilDue: inWindow.daysRemaining,
			target: { tab: 'readiness', item: null }
		}
	];
}

function currentCount(items: ReadonlyArray<{ status: string }>): number {
	return items.filter((item) => item.status === 'current').length;
}

/** Ranks every readiness problem for one Person. A failed source is reported, never read as clear. */
export function buildPersonnelAttention(input: AttentionInput): PersonnelAttention {
	const training = trainingItems(input.training);
	const criticalTasks = criticalTaskItems(input.criticalTasks);
	const failed = (Object.keys(input) as AttentionSource[]).filter((source) => !input[source].ok);

	return {
		items: [...training, ...criticalTasks, ...evaluationItems(input.evaluation), ...lossItems(input.loss)].sort(
			byUrgency
		),
		readinessBadge: {
			count: training.length + criticalTasks.length,
			complete: input.training.ok && input.criticalTasks.ok
		},
		checked: {
			training: input.training.ok
				? { state: 'checked', currentCount: currentCount(input.training.value.items) }
				: { state: 'failed' },
			criticalTasks: input.criticalTasks.ok
				? {
						state: 'checked',
						currentCount: currentCount(input.criticalTasks.value.items),
						applicableCount: input.criticalTasks.value.items.length
					}
				: { state: 'failed' },
			evaluation: input.evaluation.ok ? { state: 'checked' } : { state: 'failed' },
			loss: input.loss.ok ? { state: 'checked' } : { state: 'failed' },
			onboarding: input.onboarding.ok ? { state: 'checked', status: input.onboarding.value.state } : { state: 'failed' }
		},
		failed
	};
}
