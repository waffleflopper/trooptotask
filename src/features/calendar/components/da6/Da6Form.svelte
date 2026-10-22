<script lang="ts">
	import * as Table from '$lib/components/ui/table';
	import { cn } from '$lib/utils.js';
	import { formatDayMonth } from '$lib/utils/dates';
	import {
		cellDescription,
		cellLabel,
		dayOfMonth,
		headerDate,
		monthTitle,
		remarkText,
		weekdayLetter,
		type Da6Sheet
	} from '../../utils/da6View';
	import type { Da6Segment } from '../../roster/rosterTypes';

	interface Props {
		sheet: Da6Sheet;
		segment: Da6Segment;
		orgName: string;
		today: string;
		selectedColumn: number | null;
		onSelectDay: (column: number) => void;
	}

	let { sheet, segment, orgName, today, selectedColumn, onSelectDay }: Props = $props();

	const separate = $derived(segment.weekendMode === 'separate');
	const cells = $derived(segment.cells.flat());
	const legend = $derived({
		code: cells.some((cell) => cell?.kind === 'code' && cell.code === 'D'),
		misconduct: cells.some((cell) => cell?.kind === 'code' && cell.code === 'U'),
		planned: segment.columns.some((column) => column.when === 'planned')
	});
	const fields = $derived([
		{ label: 'Nature of duty', value: segment.natureOfDuty },
		{ label: 'Organization', value: orgName },
		{ label: 'From', value: headerDate(sheet.from) },
		{ label: 'To', value: sheet.to ? headerDate(sheet.to) : 'Open' }
	]);
</script>

{#snippet mark(muted: boolean)}
	<span
		aria-hidden="true"
		class={cn(
			'pointer-events-none absolute top-0 right-0 size-3.5 bg-[linear-gradient(to_top_right,transparent_calc(50%-0.6px),currentColor_calc(50%-0.6px),currentColor_calc(50%+0.6px),transparent_calc(50%+0.6px))]',
			muted && 'text-muted-foreground'
		)}
	></span>
{/snippet}

<section
	class="min-w-0 overflow-hidden rounded-lg border bg-card text-card-foreground print:break-inside-avoid"
	aria-label={`DA 6, ${segment.natureOfDuty}, ${headerDate(sheet.from)} to ${sheet.to ? headerDate(sheet.to) : 'open'}`}
	data-da6-form={segment.formState}
>
	<dl class="grid grid-cols-2 border-b lg:grid-cols-[2fr_2fr_1fr_1fr]">
		{#each fields as field, index (field.label)}
			<div
				class={cn(
					'min-w-0 px-4 py-2.5',
					index % 2 === 1 && 'border-l',
					index >= 2 && 'max-lg:border-t',
					index === 2 && 'lg:border-l'
				)}
			>
				<dt class="font-mono text-[10px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
					{field.label}
				</dt>
				<dd class={cn('truncate', field.value === 'Open' && 'text-muted-foreground')}>{field.value}</dd>
			</div>
		{/each}
	</dl>

	<Table.Root
		scrollRegionLabel={`${segment.natureOfDuty} DA 6 grid, ${monthTitle(segment.month)}`}
		class="w-max border-separate border-spacing-0 text-sm"
	>
		<caption class="sr-only">
			Each column is a detail day. Numbers count details since a person last pulled duty.
		</caption>
		<thead>
			<tr>
				<th
					scope="col"
					class="sticky left-0 z-20 w-14 min-w-14 border-b border-b-foreground bg-card px-2 pb-1.5 text-left align-bottom font-mono text-[10px] font-semibold tracking-[0.08em] text-muted-foreground uppercase"
				>
					Grade
				</th>
				<th
					scope="col"
					class="sticky left-14 z-20 w-32 min-w-32 border-r border-b border-b-foreground bg-card px-2 pb-1.5 text-left align-bottom font-mono text-[10px] font-semibold tracking-[0.08em] text-muted-foreground uppercase"
				>
					Name
				</th>
				{#each segment.columns as column, index (column.date)}
					{@const isToday = column.date === today}
					<th
						scope="col"
						class={cn(
							'w-9 min-w-9 border-r border-b border-b-foreground p-0 align-bottom',
							column.date > today && 'bg-card-alt',
							isToday && 'border-r-foreground bg-warning-muted'
						)}
					>
						<button
							type="button"
							class={cn(
								'flex w-full flex-col items-center gap-0.5 px-1 pt-1.5 pb-1 font-mono leading-none outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset print:pointer-events-none',
								selectedColumn === index && 'shadow-[inset_0_-3px_0_var(--accent)] print:shadow-none',
								isToday && 'text-accent-text',
								separate && column.track === 'weekend' && 'text-destructive-text'
							)}
							aria-pressed={selectedColumn === index}
							title={`Show the work for ${formatDayMonth(column.date)}`}
							onclick={() => onSelectDay(index)}
						>
							<span aria-hidden="true" class="text-[10px] text-muted-foreground">{weekdayLetter(column.date)}</span>
							<span aria-hidden="true" class="font-heading text-base font-semibold">{dayOfMonth(column.date)}</span>
							<span class="sr-only">{formatDayMonth(column.date)}</span>
						</button>
					</th>
				{/each}
			</tr>
		</thead>
		<tbody>
			{#each segment.rows as person, rowIndex (person.personId)}
				<tr>
					<th
						scope="row"
						class="sticky left-0 z-10 border-b bg-card px-2 text-left font-mono text-[11px] font-normal text-muted-foreground"
					>
						{person.rank}
					</th>
					<th scope="row" class="sticky left-14 z-10 truncate border-r border-b bg-card px-2 text-left font-normal">
						{person.lastName}
					</th>
					{#each segment.columns as column, columnIndex (column.date)}
						{@const cell = segment.cells[rowIndex][columnIndex]}
						<td
							class={cn(
								'relative h-8 border-r border-b px-1 text-center font-mono text-xs tabular-nums',
								column.date > today && 'bg-card-alt',
								column.date === today && 'border-r-foreground',
								cell?.kind === 'detail' && 'font-bold',
								cell?.kind === 'detail' && cell.when === 'served' && 'bg-warning-muted',
								(cell?.kind === 'away' || cell?.kind === 'code') && 'bg-foreground/10 font-bold',
								separate && column.track === 'weekend' && cell?.kind !== 'away' && 'text-destructive-text'
							)}
							title={cell?.kind === 'away' || cell?.kind === 'code' ? cell.reason : undefined}
							data-da6-cell={cell ? cellLabel(cell) : ''}
						>
							{#if cell}
								<span aria-hidden="true">{cellLabel(cell)}</span>
								{#if cell.kind === 'detail'}
									{@render mark(cell.when === 'planned')}
								{/if}
							{/if}
							<span class="sr-only">{cellDescription(cell)}</span>
						</td>
					{/each}
				</tr>
			{/each}
		</tbody>
	</Table.Root>

	<footer class="flex flex-col gap-4 border-t bg-card-alt px-4 py-3 lg:flex-row lg:items-start lg:justify-between">
		<ul class="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm" aria-label="Legend">
			<li class="flex items-center gap-2">
				<span
					aria-hidden="true"
					class="relative grid h-6 w-7 place-items-center bg-warning-muted font-mono text-[11px] font-bold"
				>
					13{@render mark(false)}
				</span>
				Pulled duty
			</li>
			<li class="flex items-center gap-2">
				<span
					aria-hidden="true"
					class="grid h-6 w-7 place-items-center bg-foreground/10 font-mono text-[11px] font-bold">A</span
				>
				Away, count holds
			</li>
			{#if legend.code}
				<li class="flex items-center gap-2">
					<span
						aria-hidden="true"
						class="grid h-6 w-7 place-items-center bg-foreground/10 font-mono text-[11px] font-bold">D5</span
					>
					Other duty, count runs
				</li>
			{/if}
			{#if legend.misconduct}
				<li class="flex items-center gap-2">
					<span
						aria-hidden="true"
						class="grid h-6 w-7 place-items-center bg-foreground/10 font-mono text-[11px] font-bold">U5</span
					>
					Misconduct, count runs
				</li>
			{/if}
			{#if legend.planned}
				<li class="flex items-center gap-2">
					<span
						aria-hidden="true"
						class="relative grid h-6 w-7 place-items-center border border-dashed border-muted-foreground bg-card-alt font-mono text-[11px] font-bold"
					>
						13{@render mark(true)}
					</span>
					Planned, not yet served
				</li>
			{/if}
			{#if separate}
				<li class="flex items-center gap-2">
					<span aria-hidden="true" class="grid h-6 w-7 place-items-center font-mono text-[11px] text-destructive-text"
						>5</span
					>
					Weekend and holiday count
				</li>
			{/if}
		</ul>
		<div class="min-w-0 lg:max-w-[50%]">
			<h3 class="font-mono text-[10px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">Remarks</h3>
			{#if segment.remarks.length}
				<ol class="text-sm">
					{#each segment.remarks as remark, index (index)}
						<li>({index + 1}) {remarkText(remark, sheet.from)}</li>
					{/each}
				</ol>
			{:else}
				<p class="text-sm text-muted-foreground">None.</p>
			{/if}
		</div>
	</footer>
</section>
