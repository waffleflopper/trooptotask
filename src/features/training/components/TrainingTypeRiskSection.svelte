<script lang="ts">
	import * as ReportWorkspace from '$lib/components/ui/report-workspace';
	import type { BriefingTypeRisk } from '../utils/trainingBriefing.types';

	interface Props {
		risks: BriefingTypeRisk[];
		horizonEndLabel: string;
	}

	let { risks, horizonEndLabel }: Props = $props();

	const scale = $derived(Math.max(0, ...risks.map((risk) => risk.notReady + risk.lapsing)));

	function share(count: number): string {
		return `${(count * 100) / scale}%`;
	}
</script>

<ReportWorkspace.Section variant="briefing" eyebrow="What · by training type" title="Already gone vs. about to go">
	{#snippet actions()}
		<ul class="flex flex-wrap gap-4 font-mono text-[11px] text-muted-foreground" aria-label="Type risk legend">
			<li class="flex items-center gap-1.5">
				<span class="size-2 rounded-[2px] bg-destructive" aria-hidden="true"></span>Not ready
			</li>
			<li class="flex items-center gap-1.5">
				<span class="size-2 rounded-[2px] bg-warning" aria-hidden="true"></span>Lapses by {horizonEndLabel}
			</li>
		</ul>
	{/snippet}

	<table class="w-full table-fixed border-collapse" aria-label="Not ready and lapsing requirements by training type">
		<thead>
			<tr
				class="h-7 border-b border-border text-left font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground"
			>
				<th scope="col" class="w-28 font-medium sm:w-[150px]">Type</th>
				<th scope="col" class="font-medium">Records</th>
				<th scope="col" class="w-16 text-right font-medium sm:w-20">Not ready</th>
				<th scope="col" class="w-16 text-right font-medium sm:w-20">By {horizonEndLabel}</th>
			</tr>
		</thead>
		<tbody>
			{#each risks as risk (risk.typeId)}
				<tr class="border-b border-border">
					<th scope="row" class="py-2 pr-3 text-left font-serif text-sm font-normal [overflow-wrap:anywhere]">
						{risk.name}
					</th>
					<td class="py-2">
						{#if scale > 0}
							<div class="flex h-3.5 gap-px" aria-hidden="true">
								{#if risk.notReady > 0}
									<span class="rounded-[1px] bg-destructive" style:width={share(risk.notReady)}></span>
								{/if}
								{#if risk.lapsing > 0}
									<span class="rounded-[1px] bg-warning" style:width={share(risk.lapsing)}></span>
								{/if}
							</div>
						{/if}
					</td>
					<td
						class={[
							'py-2 text-right font-mono text-[13px] font-medium',
							risk.notReady > 0 ? 'text-destructive' : 'text-muted-foreground'
						]}
					>
						{risk.notReady}
					</td>
					<td
						class={[
							'py-2 text-right font-mono text-[13px] font-semibold',
							risk.lapsing > 0 ? 'text-warning' : 'text-muted-foreground'
						]}
					>
						{risk.lapsing}
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
</ReportWorkspace.Section>
