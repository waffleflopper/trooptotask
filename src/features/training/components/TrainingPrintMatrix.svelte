<script lang="ts" module>
	import type { BriefingBand, BriefingGridCell, BriefingReadiness } from '../utils/trainingBriefing.types';

	const BAND_FILL: Record<Exclude<BriefingBand, 'none'>, string> = {
		goal: 'bg-(--training-print-goal)',
		near: 'bg-(--training-print-near)',
		below: 'bg-(--training-print-below)',
		far: 'bg-(--training-print-far)',
		critical: 'bg-(--training-print-critical)'
	};

	function percentLabel(readiness: BriefingReadiness): string {
		return readiness.percent === null ? '—' : `${readiness.percent}%`;
	}
</script>

<script lang="ts">
	import type { BriefingGridRow, TrainingBriefingReportData } from '../contracts';
	import { PRINT_MATRIX_WIDTHS, PRINT_ROW_NOUNS, type PrintColumnChunk } from '../utils/trainingPrintLayout';
	import TrainingPrintRunningHeader from './TrainingPrintRunningHeader.svelte';

	interface Props {
		report: TrainingBriefingReportData;
		chunk: PrintColumnChunk<BriefingGridRow>;
		context: string;
	}

	let { report, chunk, context }: Props = $props();

	const briefing = $derived(report.briefing);
	const grid = $derived(briefing.grid);
	const columnTotal = $derived(grid.rows.length);
	const bottomLine = $derived(briefing.bottomLine);
	const noun = $derived(PRINT_ROW_NOUNS[grid.rowsBy]);
	const goal = $derived(briefing.forecast.goalPercent);
	const risks = $derived(new Map(briefing.typeRisk.map((risk) => [risk.typeId, risk])));
	const colspan = $derived(chunk.columns.length + 4);
	const range = $derived(
		columnTotal > chunk.columns.length
			? `${noun.many} ${chunk.start + 1}–${chunk.start + chunk.columns.length} of ${columnTotal}`
			: null
	);
</script>

{#snippet readiness(cell: BriefingGridCell, gap = false)}
	{@const band = cell.today.band}
	<td
		class={[
			'border border-white p-0 text-center font-mono text-[13px] leading-6 whitespace-nowrap',
			gap && 'border-r-4',
			band === 'none' ? 'text-muted-foreground' : BAND_FILL[band],
			band !== 'none' && band !== 'goal' && 'font-semibold',
			cell.dropAlert && 'outline-[1.25px] outline-solid outline-foreground -outline-offset-2'
		]}
	>
		{#if band === 'none'}
			—<span class="sr-only">no applicable requirements</span>
		{:else}
			{cell.today.percent}{#if cell.dropAlert}<span class="ml-0.5 text-[11px] font-bold tracking-[-0.02em]"
					>▼{cell.drop}</span
				>{/if}
		{/if}
	</td>
{/snippet}

<section class="break-before-page" aria-label={`Training type by ${noun.one}${range ? `, ${range}` : ''}`}>
	<table class="w-full table-fixed border-separate border-spacing-0">
		<colgroup>
			<col style:width={`${PRINT_MATRIX_WIDTHS.type}px`} />
			<col style:width={`${PRINT_MATRIX_WIDTHS.all}px`} />
			{#each chunk.columns as column (column.item.key)}
				<col style:width={`${column.width}px`} />
			{/each}
			<col style:width={`${PRINT_MATRIX_WIDTHS.count}px`} />
			<col style:width={`${PRINT_MATRIX_WIDTHS.count}px`} />
		</colgroup>
		<thead>
			<TrainingPrintRunningHeader organizationName={report.organizationName} {context} {colspan} />
			<tr>
				<td {colspan} class="p-0 pb-2.5">
					<div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
						<p class="font-mono text-[9.5px] leading-3 uppercase tracking-[0.08em] text-muted-foreground">
							Where and what
						</p>
						<h3 class="font-heading text-[19px] leading-[22px] font-semibold">
							Training type by {noun.one}{chunk.start > 0 ? ', continued' : ''}
						</h3>
						{#if range}
							<p
								class="px-1.5 py-px font-mono text-[10px] leading-3 font-semibold uppercase tracking-[0.04em] shadow-[inset_0_0_0_1px_var(--foreground)]"
							>
								{range}
							</p>
						{/if}
					</div>
				</td>
			</tr>
			<tr class="align-bottom">
				<th
					scope="col"
					class="border-b-[1.5px] border-foreground pr-2 pb-1 text-left font-mono text-[9px] leading-3 font-normal uppercase tracking-[0.08em] text-muted-foreground"
				>
					Training type · selected order
				</th>
				<th scope="col" class="border-b-[1.5px] border-foreground px-px pb-1 text-center font-normal">
					<span class="block font-heading text-[13px] leading-[14px] font-bold">All {noun.many}</span>
					<span class="block font-mono text-[9px] leading-3 text-muted-foreground">{grid.total.soldierCount}</span>
				</th>
				{#each chunk.columns as column (column.item.key)}
					<th scope="col" class="border-b-[1.5px] border-foreground px-px pb-1 text-center font-normal">
						<span class="block font-heading text-[13px] leading-[14px] font-semibold [overflow-wrap:anywhere]"
							>{column.item.label}</span
						>
						<span class="block font-mono text-[9px] leading-3 text-muted-foreground">{column.item.soldierCount}</span>
					</th>
				{/each}
				<th
					scope="col"
					class="border-b-[1.5px] border-foreground pr-1 pb-1 text-right font-heading text-[13px] leading-[14px] font-semibold"
				>
					Not ready
				</th>
				<th
					scope="col"
					class="border-b-[1.5px] border-foreground pr-1 pb-1 text-right font-heading text-[13px] leading-[14px] font-semibold"
				>
					Lapse by {bottomLine.horizonEndLabel}
				</th>
			</tr>
		</thead>
		<tbody>
			{#each grid.columns as type, index (type.typeId)}
				{@const risk = risks.get(type.typeId)}
				<tr>
					<th
						scope="row"
						class="border-b border-border py-1 pr-2 text-left font-serif text-[13px] leading-4 font-normal [overflow-wrap:anywhere]"
					>
						{type.name}
					</th>
					{@render readiness(grid.total.cells[index], true)}
					{#each chunk.columns as column (column.item.key)}
						{@render readiness(column.item.cells[index])}
					{/each}
					<td class="border-b border-border pr-1 text-right font-mono text-[13px]">{risk?.notReady ?? 0}</td>
					<td class="border-b border-border pr-1 text-right font-mono text-[13px] font-semibold">
						{risk?.lapsing ?? 0}
					</td>
				</tr>
			{/each}
		</tbody>
		<tbody class="break-inside-avoid">
			<tr class="[&>*]:border-t-[1.5px] [&>*]:border-foreground">
				<th scope="row" class="py-1 text-left font-mono text-[9px] leading-3 font-normal uppercase tracking-[0.04em]">
					All selected types · today
				</th>
				<td class="text-center font-heading text-[16px] font-extrabold">{percentLabel(grid.total.today)}</td>
				{#each chunk.columns as column (column.item.key)}
					<td class="text-center font-heading text-[16px] font-bold">{percentLabel(column.item.today)}</td>
				{/each}
				<td class="pr-1 text-right font-mono text-[13px] font-semibold">
					{bottomLine.expired + bottomLine.notRecorded}
				</td>
				<td class="pr-1 text-right font-mono text-[13px] font-semibold">{bottomLine.lapsing}</td>
			</tr>
			<tr>
				<th scope="row" class="py-1 text-left font-mono text-[9px] leading-3 font-normal uppercase tracking-[0.04em]">
					All selected types · by {bottomLine.horizonEndLabel}
				</th>
				<td class="text-center font-heading text-[16px] font-extrabold">{percentLabel(grid.total.horizon)}</td>
				{#each chunk.columns as column (column.item.key)}
					<td class="text-center font-heading text-[16px] font-bold">{percentLabel(column.item.horizon)}</td>
				{/each}
				<td></td>
				<td></td>
			</tr>
		</tbody>
		<tfoot>
			<tr>
				<td {colspan} class="p-0 pt-2.5">
					<p class="font-serif text-[11px] leading-[14px]">
						Cells: % of applicable requirements ready today. Under each {noun.one}: soldiers. Right columns: requirement
						counts across all {noun.many}.
					</p>
					<ul class="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 font-mono text-[9px] leading-3">
						<li class="pr-1 tracking-[0.06em] text-muted-foreground">KEY</li>
						{#each grid.legend as item (item.band)}
							<li class={['px-1.5 py-px', BAND_FILL[item.band], item.band !== 'goal' && 'font-semibold']}>
								{item.label}
							</li>
						{/each}
						<li class="pr-2.5 pl-1">bold = below the {goal}% goal</li>
						<li class="px-1.5 py-px font-bold outline-[1.25px] outline-solid outline-foreground -outline-offset-1">
							86▼14
						</li>
						<li class="pr-2.5">
							86% today, loses 14 points by {bottomLine.horizonEndLabel} (marked at {grid.dropAlertPoints}+)
						</li>
						<li>— no soldier in the {noun.one} requires the type</li>
					</ul>
				</td>
			</tr>
		</tfoot>
	</table>
</section>
