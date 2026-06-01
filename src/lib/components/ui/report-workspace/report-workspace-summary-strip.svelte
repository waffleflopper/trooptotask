<script lang="ts">
	export type SummaryStripTone = 'default' | 'warning' | 'danger' | 'success';

	type Props = {
		topRisk: string;
		population: string;
		parameters: string;
		findings: string[];
		riskTone?: SummaryStripTone;
		ariaLabel?: string;
	};

	let {
		topRisk,
		population,
		parameters,
		findings,
		riskTone = 'default',
		ariaLabel = 'Report summary'
	}: Props = $props();

	const displayedFindings = $derived(findings.slice(0, 3));
</script>

<div
	data-slot="report-workspace-summary-strip"
	class="grid min-w-0 divide-y divide-border text-sm sm:grid-cols-[minmax(0,1.1fr)_minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,1.5fr)] sm:divide-x sm:divide-y-0"
	aria-label={ariaLabel}
>
	<div class="min-w-0 px-3 py-2.5">
		<p class="font-mono text-[0.6875rem] font-semibold tracking-[0.08em] text-muted-foreground uppercase">Top risk</p>
		<p
			class={[
				'mt-1 font-semibold [overflow-wrap:anywhere]',
				riskTone === 'danger' && 'text-destructive',
				riskTone === 'warning' && 'text-warning-foreground',
				riskTone === 'success' && 'text-success-foreground'
			]}
		>
			{topRisk}
		</p>
	</div>
	<div class="min-w-0 px-3 py-2.5">
		<p class="font-mono text-[0.6875rem] font-semibold tracking-[0.08em] text-muted-foreground uppercase">Population</p>
		<p class="mt-1 font-medium [overflow-wrap:anywhere]">{population}</p>
	</div>
	<div class="min-w-0 px-3 py-2.5">
		<p class="font-mono text-[0.6875rem] font-semibold tracking-[0.08em] text-muted-foreground uppercase">Parameters</p>
		<p class="mt-1 font-medium [overflow-wrap:anywhere]">{parameters}</p>
	</div>
	<div class="min-w-0 px-3 py-2.5">
		<p class="font-mono text-[0.6875rem] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
			Key findings
		</p>
		<ul class="mt-1 space-y-1 text-muted-foreground">
			{#each displayedFindings as finding, index (`${index}:${finding}`)}
				<li class="[overflow-wrap:anywhere]">{finding}</li>
			{:else}
				<li>No findings for the current report.</li>
			{/each}
		</ul>
	</div>
</div>
