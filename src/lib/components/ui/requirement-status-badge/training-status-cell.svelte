<script lang="ts" module>
	import type { TrainingRequirementStatus } from './training-status-badge.svelte';

	export const trainingStatusCellClasses: Record<TrainingRequirementStatus, string> = {
		current: 'bg-success-muted text-success-foreground ring-success/20',
		'warning-yellow': 'bg-warning-muted text-warning-foreground ring-warning/20',
		'warning-orange': 'bg-orange-500/10 text-orange-700 ring-orange-500/20 dark:text-orange-300',
		expired: 'bg-danger-muted text-danger-foreground ring-danger/20',
		'not-completed': 'bg-muted text-muted-foreground ring-border',
		'not-required': 'bg-background text-muted-foreground ring-border',
		exempt: 'bg-info-muted text-info-foreground ring-info/20'
	};
</script>

<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils.js';

	let {
		status,
		label,
		srLabel,
		class: className,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLSpanElement>> & {
		status: TrainingRequirementStatus;
		label: string;
		srLabel?: string;
	} = $props();
</script>

<span
	data-slot="training-status-cell"
	data-status={status}
	class={cn(
		'inline-flex min-h-8 w-full items-center justify-center overflow-hidden rounded-md px-2 py-1 text-center font-mono text-[10px] font-semibold uppercase tracking-[0.04em] ring-1 ring-inset',
		trainingStatusCellClasses[status],
		className
	)}
	{...restProps}
>
	<span class="truncate" aria-hidden={srLabel ? 'true' : undefined}>{label}</span>
	{#if srLabel}
		<span class="sr-only">{srLabel}</span>
	{/if}
</span>
