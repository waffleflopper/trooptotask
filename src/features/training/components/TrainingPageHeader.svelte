<script lang="ts">
	import * as PageShell from '$lib/components/patterns/page-shell';
	import { readinessBandTone } from '$lib/components/patterns/readiness-band/index.js';
	import * as Alert from '$lib/components/ui/alert';
	import { Button } from '$lib/components/ui/button';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { BRIEFING_BAND_TIER } from '../utils/briefingBandTier';
	import { MATRIX_HORIZON_DAYS } from '../utils/matrixReadiness';
	import type { TrainingReadinessSummary } from '../utils/trainingBriefing';

	interface Props {
		orgName: string;
		personnelCount: number;
		/** Null while the workspace loads. */
		summary: TrainingReadinessSummary | null;
		/** The Organization goal could not be read, so the readiness figures are withheld. */
		readinessUnavailable?: boolean;
	}

	let { orgName, personnelCount, summary, readinessUnavailable = false }: Props = $props();

	const percentLabel = (percent: number | null) => (percent === null ? '—' : `${percent}%`);
</script>

{#snippet count(value: number, label: string, tone: string)}
	<span class={['tabular-nums', value > 0 ? tone : 'text-muted-foreground']}>{value} {label}</span>
{/snippet}

{#snippet counts()}
	{#if summary}
		<p class="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-lg">
			{@render count(summary.expired, 'expired', 'font-semibold text-danger-foreground')}
			<span class="h-3.5 w-px bg-border" aria-hidden="true"></span>
			{@render count(
				summary.lapsing,
				`expire within ${MATRIX_HORIZON_DAYS} days`,
				'font-semibold text-warning-foreground'
			)}
			<span class="h-3.5 w-px bg-border" aria-hidden="true"></span>
			{@render count(summary.notRecorded, 'not recorded', 'text-foreground')}
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
	{#if readinessUnavailable}
		<Alert.Root variant="destructive" class="max-w-sm">
			<Alert.Title>Unable to load readiness</Alert.Title>
			<Alert.Description>The readiness goal could not be read.</Alert.Description>
			<Alert.Action>
				<Button type="button" variant="destructive" size="xs" onclick={() => window.location.reload()}>Retry</Button>
			</Alert.Action>
		</Alert.Root>
	{:else if summary}
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
