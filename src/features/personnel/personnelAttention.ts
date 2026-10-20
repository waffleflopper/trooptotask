import { isReadinessProblem } from '$lib/domain/readinessItem';
import { formatDayMonth, formatDayMonthYear } from '$lib/utils/dates';
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

type TrainingItem = Extract<AttentionInput['training'], { ok: true }>['value']['items'][number];
type CriticalTaskItem = Extract<AttentionInput['criticalTasks'], { ok: true }>['value']['items'][number];

function requiredFor(applicability: TrainingItem['applicability']): string {
	switch (applicability.kind) {
		case 'all':
			return 'all Soldiers';
		case 'mos':
			return applicability.mos;
		case 'role':
			return applicability.role;
		case 'rank':
			return applicability.rank;
	}
}

function trainingDetail(item: TrainingItem): string {
	const expires = item.completion?.expirationDate;
	const completed = item.completion?.completionDate;
	if (item.status === 'missing') return `Required for ${requiredFor(item.applicability)} · no completion on record`;
	if (item.status === 'expired' && expires) {
		return completed
			? `Lapsed ${formatDayMonth(expires)} · last completed ${formatDayMonthYear(completed)}`
			: `Lapsed ${formatDayMonth(expires)}`;
	}
	const cycle = item.cycleMonths === null ? null : `${item.cycleMonths}-month cycle`;
	return [expires ? `Expires ${formatDayMonth(expires)}` : null, cycle].filter(Boolean).join(' · ');
}

function criticalTaskDetail(item: CriticalTaskItem): string {
	if (!item.latest) return `${item.taskCode} · no validation on record`;
	const by = item.latest.validatedBy ? ` by ${item.latest.validatedBy}` : '';
	return `${item.taskCode} · validated ${formatDayMonthYear(item.latest.completedAt)}${by}`;
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
				detail: trainingDetail(item),
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
				detail: criticalTaskDetail(item),
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
			detail: [
				`Thru ${formatDayMonth(entry.periodEnd)}`,
				entry.rater ? `rater ${entry.rater}` : null,
				entry.phase.label.toLowerCase()
			]
				.filter(Boolean)
				.join(' · '),
			dueDate: entry.periodEnd,
			daysUntilDue: entry.daysUntilThru,
			target: { tab: 'evals', entryId: entry.entryId }
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
			title: `${inWindow.trigger} ${formatDayMonthYear(inWindow.date)}`,
			detail: `Inside the ${windowDays}-day loss window`,
			dueDate: inWindow.date,
			daysUntilDue: inWindow.daysRemaining,
			target: { tab: 'data-sheet' }
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
