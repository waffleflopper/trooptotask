<script lang="ts" module>
	import type { RatingDueStatus, ReportType, WorkflowStatus } from '../rating-scheme.types';

	export type EvalBadgeKind = 'due' | 'type' | 'workflow';

	type EvalDueBadgeStatus = 'current' | 'expiring-soon' | 'expiring' | 'expired' | 'completed';

	const dueStatusMap: Record<RatingDueStatus, EvalDueBadgeStatus> = {
		current: 'current',
		'due-60': 'expiring-soon',
		'due-30': 'expiring',
		overdue: 'expired',
		completed: 'completed'
	};

	const dueClasses: Record<EvalDueBadgeStatus, string> = {
		current: 'border-success/20 bg-success-muted text-success-foreground',
		'expiring-soon': 'border-warning/20 bg-warning-muted text-warning-foreground',
		expiring: 'border-orange-500/20 bg-orange-500/10 text-orange-700 dark:text-orange-300',
		expired: 'border-danger/20 bg-danger-muted text-danger-foreground',
		completed: 'border-border bg-muted text-muted-foreground'
	};

	const evalTypeClasses: Record<'NCOER' | 'OER' | 'WOER', string> = {
		NCOER: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
		OER: 'border-sky-500/20 bg-sky-500/10 text-sky-700 dark:text-sky-300',
		WOER: 'border-violet-500/20 bg-violet-500/10 text-violet-700 dark:text-violet-300'
	};

	const workflowClasses: Record<WorkflowStatus, string> = {
		drafting: 'border-border bg-muted text-muted-foreground',
		'with-rater': 'border-info/20 bg-info-muted text-info-foreground',
		'rater-signed': 'border-success/20 bg-success-muted/60 text-success-foreground',
		'with-senior-rater': 'border-info/20 bg-info-muted text-info-foreground',
		'sr-signed': 'border-success/20 bg-success-muted/60 text-success-foreground',
		'with-intermediate-rater': 'border-info/20 bg-info-muted text-info-foreground',
		'ir-signed': 'border-success/20 bg-success-muted/60 text-success-foreground',
		'with-reviewer': 'border-info/20 bg-info-muted text-info-foreground',
		'reviewer-signed': 'border-success/20 bg-success-muted/60 text-success-foreground',
		'with-rated-soldier': 'border-purple-500/20 bg-purple-500/10 text-purple-700 dark:text-purple-300',
		'sm-signed': 'border-success/20 bg-success-muted/70 text-success-foreground',
		'submitted-to-s1': 'border-warning/20 bg-warning-muted text-warning-foreground',
		completed: 'border-success/30 bg-success-muted text-success-foreground'
	};

	export function getEvalDueRequirementStatus(status: RatingDueStatus): EvalDueBadgeStatus {
		return dueStatusMap[status];
	}

	export function getEvalBadgeClass(kind: EvalBadgeKind, value: string): string {
		if (kind === 'due') return dueClasses[getEvalDueRequirementStatus(value as RatingDueStatus)];
		if (kind === 'type') return evalTypeClasses[value as 'NCOER' | 'OER' | 'WOER'];
		return workflowClasses[value as WorkflowStatus];
	}
</script>

<script lang="ts">
	import type { HTMLAnchorAttributes } from 'svelte/elements';
	import { Badge } from '$lib/components/ui/badge';
	import { cn, type WithElementRef } from '$lib/utils';

	let {
		kind,
		value,
		reportType,
		children,
		class: className,
		...restProps
	}: WithElementRef<HTMLAnchorAttributes> & {
		kind: EvalBadgeKind;
		value: RatingDueStatus | 'NCOER' | 'OER' | 'WOER' | WorkflowStatus;
		reportType?: ReportType | null;
	} = $props();

	const badgeClass = $derived(getEvalBadgeClass(kind, value));
	const fallbackLabel = $derived(kind === 'type' && reportType ? `${value}/${reportType}` : value);
</script>

<Badge variant="outline" class={cn(badgeClass, className)} {...restProps}>
	{#if children}
		{@render children()}
	{:else}
		{fallbackLabel}
	{/if}
</Badge>
