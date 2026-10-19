import type { AttentionListRow } from '$lib/components/patterns/readiness-items';
import { formatDayOffset } from '$lib/utils/dates';
import type { AttentionItem, AttentionSource, PersonnelAttention } from './personnelReadiness.types';
import { attentionTargetHref } from './readinessDrawerTarget';

const CATEGORY: Record<AttentionItem['kind'], string> = {
	training: 'Training',
	'critical-task': 'Critical task',
	evaluation: 'Evaluation',
	loss: 'Loss'
};

const SOURCE_NAME: Record<AttentionSource, string> = {
	training: 'training',
	criticalTasks: 'critical tasks',
	evaluation: 'the evaluation',
	loss: 'loss dates',
	onboarding: 'onboarding'
};

export function attentionRows(
	attention: PersonnelAttention,
	paths: { person: string; org: string }
): AttentionListRow[] {
	return attention.items.map((item) => ({
		id: `${item.kind}:${item.id}`,
		status: item.status,
		title: item.title,
		detail: item.detail,
		category: CATEGORY[item.kind],
		timing: item.daysUntilDue === null ? 'Not recorded' : formatDayOffset(item.daysUntilDue),
		href: attentionTargetHref(item.target, paths)
	}));
}

/** "Couldn't check <source>" for every source that failed or was denied, so silence never reads as clear. */
export function uncheckedSources(attention: PersonnelAttention): string[] {
	return attention.failed.map((source) => SOURCE_NAME[source]);
}

/** What was checked and found fine, so the list can show problems only. A zero count reassures no one. */
export function alsoChecked(checked: PersonnelAttention['checked']): string[] {
	const facts: string[] = [];
	if (checked.training.state === 'checked' && checked.training.currentCount > 0)
		facts.push(`${checked.training.currentCount} training items current`);
	if (checked.criticalTasks.state === 'checked' && checked.criticalTasks.currentCount > 0) {
		facts.push(
			`${checked.criticalTasks.currentCount} of ${checked.criticalTasks.applicableCount} critical tasks current`
		);
	}
	if (checked.onboarding.state === 'checked' && checked.onboarding.status !== 'none') {
		facts.push(checked.onboarding.status === 'complete' ? 'onboarding complete' : 'onboarding in progress');
	}
	return facts;
}
