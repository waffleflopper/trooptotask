<script lang="ts">
	import * as PageShell from '$lib/components/patterns/page-shell';
	import { readinessBandTone } from '$lib/components/patterns/readiness-band/index.js';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { BRIEFING_BAND_TIER, MATRIX_HORIZON_DAYS } from '../utils/matrixReadiness';
	import type { TrainingReadinessSummary } from '../utils/trainingBriefing';

	interface Props {
		orgName: string;
		personnelCount: number;
		/** Null while the workspace loads. */
		summary: TrainingReadinessSummary | null;
	}

	let { orgName, personnelCount, summary }: Props = $props();

	const percentLabel = (percent: number | null) => (percent === null ? '—' : `${percent}%`);
</script>

{#snippet counts()}
	{#if summary}
		<p class="flex flex-wrap items-center gap-x-4 gap-y-1 text-lg font-medium">
			<span class="text-danger-foreground tabular-nums">{summary.expired} expired</span>
			<span class="text-warning-foreground tabular-nums"
				>{summary.lapsing} expire within {MATRIX_HORIZON_DAYS} days</span
			>
			<span class="text-foreground tabular-nums">{summary.notRecorded} not recorded</span>
		</p>
	{:else}
		<div class="flex flex-wrap gap-x-4 gap-y-1" role="status" aria-label="Loading training counts">
			<Skeleton class="h-7 w-24" />
			<Skeleton class="h-7 w-44" />
			<Skeleton class="h-7 w-32" />
		</div>
	{/if}
{/snippet}

{#snippet readiness()}
	{#if summary}
		<div class="flex items-center gap-3">
			<span
				class={[
					'font-heading text-6xl leading-none font-semibold tabular-nums',
					readinessBandTone[BRIEFING_BAND_TIER[summary.today.band]]
				]}
			>
				{percentLabel(summary.today.percent)}
			</span>
			<div class="grid gap-0.5 font-mono text-xs tracking-[0.08em] uppercase">
				<span class="font-semibold">Ready today</span>
				<span class="text-muted-foreground">
					Goal {summary.goalPercent}% · {summary.today.ready} of {summary.today.applicable}
				</span>
				<span class={readinessBandTone[BRIEFING_BAND_TIER[summary.horizon.band]]}>
					{percentLabel(summary.horizon.percent)} by {summary.horizonEndLabel} if no one renews
				</span>
			</div>
		</div>
	{:else}
		<div class="flex items-center gap-3" role="status" aria-label="Loading readiness">
			<Skeleton class="h-15 w-28" />
			<div class="grid gap-1">
				<Skeleton class="h-4 w-24" />
				<Skeleton class="h-4 w-40" />
				<Skeleton class="h-4 w-56" />
			</div>
		</div>
	{/if}
{/snippet}

<PageShell.Header
	eyebrow="Training · {orgName} · {personnelCount} personnel"
	title="Training"
	variant="display"
	subtitle={counts}
	aside={readiness}
/>
