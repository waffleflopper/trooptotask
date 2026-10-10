<script lang="ts">
	import * as ReportWorkspace from '$lib/components/patterns/report-workspace';
	import * as Table from '$lib/components/ui/table';
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

	<Table.Root class="table-fixed border-collapse" aria-label="Not ready and lapsing requirements by training type">
		<Table.Header>
			<Table.Row
				class="h-7 border-border text-left font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground hover:bg-transparent"
			>
				<Table.Head class="h-7 w-28 px-0 sm:w-[150px]">Type</Table.Head>
				<Table.Head class="h-7 px-0">Records</Table.Head>
				<Table.Head class="h-7 w-16 px-0 text-right sm:w-20">Not ready</Table.Head>
				<Table.Head class="h-7 w-16 px-0 text-right sm:w-20">By {horizonEndLabel}</Table.Head>
			</Table.Row>
		</Table.Header>
		<Table.Body>
			{#each risks as risk (risk.typeId)}
				<Table.Row class="border-border hover:bg-transparent">
					<Table.Head
						scope="row"
						class="h-auto px-0 py-2 pr-3 font-serif text-sm font-normal whitespace-normal [overflow-wrap:anywhere]"
					>
						{risk.name}
					</Table.Head>
					<Table.Cell class="px-0 py-2">
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
						<span class="sr-only">{risk.notReady} not ready, {risk.lapsing} lapsing by {horizonEndLabel}</span>
					</Table.Cell>
					<Table.Cell
						class={[
							'px-0 py-2 text-right font-mono text-[13px] font-medium',
							risk.notReady > 0 ? 'text-destructive' : 'text-muted-foreground'
						]}
					>
						{risk.notReady}
					</Table.Cell>
					<Table.Cell
						class={[
							'px-0 py-2 text-right font-mono text-[13px] font-semibold',
							risk.lapsing > 0 ? 'text-warning' : 'text-muted-foreground'
						]}
					>
						{risk.lapsing}
					</Table.Cell>
				</Table.Row>
			{/each}
		</Table.Body>
	</Table.Root>
</ReportWorkspace.Section>
