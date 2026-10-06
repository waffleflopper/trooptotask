<script lang="ts" module>
	const COLUMN_WIDTHS = [34, 46, 200, 150, 214, 120, 112, 90];
</script>

<script lang="ts">
	import { formatDisplayDate } from '$lib/utils/dates';
	import type { TrainingBriefingDetail } from '../contracts';
	import TrainingPrintRunningHeader from './TrainingPrintRunningHeader.svelte';

	interface Props {
		detail: TrainingBriefingDetail;
		organizationName: string;
		context: string;
		scopeLabel: string;
		horizonEndLabel: string;
	}

	let { detail, organizationName, context, scopeLabel, horizonEndLabel }: Props = $props();

	const first = $derived((detail.page - 1) * detail.pageSize + 1);
	const lastShown = $derived(first + detail.rows.length - 1);
	const complete = $derived(detail.rows.length === detail.totalRows);
	const requirementLabel = $derived(detail.totalRows === 1 ? 'requirement' : 'requirements');
</script>

<section class="break-before-page" aria-label="Affected soldiers, loaded page">
	<table class="w-full table-fixed border-separate border-spacing-0">
		<colgroup>
			{#each COLUMN_WIDTHS as width, index (index)}
				<col style:width={`${width}px`} />
			{/each}
		</colgroup>
		<thead>
			<TrainingPrintRunningHeader {organizationName} {context} colspan={COLUMN_WIDTHS.length} />
			<tr>
				<td colspan={COLUMN_WIDTHS.length} class="p-0 pb-3">
					<div class="flex items-end justify-between gap-6">
						<div class="min-w-0">
							<div class="flex items-baseline gap-3">
								<p class="font-mono text-[9.5px] leading-3 uppercase tracking-[0.08em] text-muted-foreground">
									Appendix · loaded detail
								</p>
								<h3 class="font-heading text-[19px] leading-[22px] font-semibold">Affected soldiers</h3>
							</div>
							<p class="font-serif text-[12px] leading-4">
								Scope: {scopeLabel}. {detail.totalRows}
								{requirementLabel} not ready or lapsing by {horizonEndLabel}.
							</p>
						</div>
						<div class="shrink-0 text-right font-mono tracking-[0.04em]">
							<p class="text-[11px] leading-[14px] font-semibold uppercase">
								Rows {first}–{lastShown} of {detail.totalRows}
							</p>
							<p class="text-[9px] leading-3 text-muted-foreground">
								Loaded page {detail.page} of {detail.totalPages} · {detail.pageSize} per page
							</p>
						</div>
					</div>
				</td>
			</tr>
			<tr
				class="font-mono text-[9px] leading-3 uppercase tracking-[0.06em] text-muted-foreground [&>th]:border-b-[1.5px] [&>th]:border-foreground [&>th]:pb-1 [&>th]:text-left [&>th]:font-normal"
			>
				<th scope="col" class="pr-2.5 text-right!">#</th>
				<th scope="col">Rank</th>
				<th scope="col">Name</th>
				<th scope="col">Group</th>
				<th scope="col">Training type</th>
				<th scope="col">Status today</th>
				<th scope="col">Expiration date</th>
				<th scope="col">Lapses by {horizonEndLabel}</th>
			</tr>
		</thead>
		<tbody class="[&_td]:border-b [&_td]:border-border [&_td]:py-0.5 [&_td]:pr-2 [&_td]:[overflow-wrap:anywhere]">
			{#each detail.rows as row, index (`${row.personId}:${row.typeId}`)}
				<tr>
					<td class="pr-2.5! text-right font-mono text-[10px] text-muted-foreground">{first + index}</td>
					<td class="font-mono text-[11px]">{row.rank}</td>
					<td class="font-serif text-[12px] leading-[15px]">{row.name}</td>
					<td class="font-serif text-[12px] leading-[15px]">{row.groupName}</td>
					<td class="font-serif text-[12px] leading-[15px]">{row.typeName}</td>
					<td class="font-mono text-[11px]">{row.label}</td>
					<td class="font-mono text-[11px]">{row.expirationDate ? formatDisplayDate(row.expirationDate) : '—'}</td>
					<td class="font-mono text-[11px]">{row.lapsesInHorizon ? 'Yes' : 'No'}</td>
				</tr>
			{/each}
		</tbody>
	</table>
	<p class="mt-3 flex items-baseline gap-2.5 break-inside-avoid">
		<span class="shrink-0 font-mono text-[9.5px] leading-[15px] font-semibold tracking-[0.06em]">
			{complete ? 'END OF AFFECTED SOLDIERS' : 'END OF LOADED PAGE'}
		</span>
		<span class="font-serif text-[11.5px] leading-[15px]">
			{#if complete}
				Every affected requirement in this scope is printed.
			{:else}
				Only rows {first}–{lastShown} of {detail.totalRows} were loaded and printed. Load another page before printing, or
				use Export Excel for every affected requirement.
			{/if}
		</span>
	</p>
</section>
