<script lang="ts" module>
	import type { TrainingStatus } from '../contracts';

	/** Quiet when nothing is needed; amber for expiring, red for expired or missing. */
	export const trainingMatrixCellClasses: Record<TrainingStatus, string> = {
		current: 'text-foreground',
		'warning-yellow': 'text-warning-foreground ring-2 ring-warning ring-inset font-bold',
		'warning-orange': 'bg-warning/25 text-warning-foreground ring-2 ring-warning ring-inset font-bold',
		expired: 'bg-destructive text-destructive-foreground font-bold uppercase',
		'not-completed': 'text-danger-foreground ring-2 ring-destructive ring-inset font-bold uppercase',
		'not-required': 'text-muted-foreground/60',
		exempt: 'text-muted-foreground uppercase'
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
		status: TrainingStatus;
		label: string;
		srLabel?: string;
	} = $props();
</script>

<span
	data-slot="training-matrix-cell"
	data-status={status}
	class={cn(
		'm-[3px] inline-flex flex-1 items-center justify-center overflow-hidden px-1 text-center font-mono text-[11px] tracking-[0.04em]',
		trainingMatrixCellClasses[status],
		className
	)}
	{...restProps}
>
	<span class="truncate" aria-hidden={srLabel ? 'true' : undefined}>{label}</span>
	{#if srLabel}
		<span class="sr-only">{srLabel}</span>
	{/if}
</span>
