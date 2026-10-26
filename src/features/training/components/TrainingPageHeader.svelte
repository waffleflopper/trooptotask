<script lang="ts">
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { MATRIX_HORIZON_DAYS } from '../utils/matrixReadiness';
	import type { TrainingReadinessSummary } from '../utils/trainingBriefing';

	interface Props {
		/** Null while the workspace loads. */
		summary: TrainingReadinessSummary | null;
	}

	let { summary }: Props = $props();
</script>

{#snippet count(value: number, label: string, tone: string)}
	<span class={['tabular-nums', value > 0 ? tone : 'text-muted-foreground']}>{value} {label}</span>
{/snippet}

<header class="flex min-h-4 justify-end">
	<h1 class="sr-only">Training</h1>
	{#if summary}
		<p class="flex flex-wrap justify-end gap-x-2 font-mono text-xs tracking-[0.08em] uppercase">
			{@render count(summary.expired, 'expired', 'text-danger-foreground')}
			<span class="text-muted-foreground" aria-hidden="true">·</span>
			{@render count(summary.lapsing, `expire within ${MATRIX_HORIZON_DAYS} days`, 'text-warning-foreground')}
		</p>
	{:else}
		<Skeleton class="h-4 w-64" role="status" aria-label="Loading training counts" />
	{/if}
</header>
