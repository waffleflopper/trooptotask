<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import type { StatusType } from '$features/calendar/contracts';
	import type { BottomLine, OutPersonRow } from '../read-model/strengthBand';

	let { line, statusById }: { line: BottomLine; statusById: ReadonlyMap<string, StatusType> } = $props();

	const uid = $props.id();
	let showAllNames = $state(false);

	const stripLabel = $derived(
		line.strip
			.map((segment) =>
				segment.statusTypeId === null
					? `${segment.count} available`
					: `${segment.count} ${statusById.get(segment.statusTypeId)?.name ?? 'out'}`
			)
			.join(', ')
	);
	const outCount = $derived(line.outPeople.length);

	const PERSON_ROWS = 'grid grid-cols-[10px_fit-content(9rem)_minmax(0,1fr)_auto] gap-x-2.5';
</script>

{#snippet swatch(statusTypeId: string)}
	<span
		class="size-2.5 shrink-0 rounded-[2px]"
		style:background-color={statusById.get(statusTypeId)?.color}
		aria-hidden="true"
	></span>
{/snippet}

{#snippet personRows(rows: readonly OutPersonRow[])}
	{#each rows as row (row.personnelId)}
		{@const name = statusById.get(row.statusTypeId)?.name}
		<li class="col-span-full grid h-9 grid-cols-subgrid items-center border-b border-border">
			{@render swatch(row.statusTypeId)}
			<span class="truncate text-sm" title={name}>{name}</span>
			<span class="min-w-0 truncate text-sm text-secondary-foreground">{row.name}</span>
			<span class="font-mono text-xs whitespace-nowrap text-muted-foreground">{row.backLabel}</span>
		</li>
	{/each}
{/snippet}

<div class="grid gap-[18px]">
	<div class="flex flex-wrap items-end gap-x-4 gap-y-2">
		<span
			class={[
				'font-heading text-[120px] leading-[96px] font-extrabold tracking-[-0.03em]',
				line.belowFloor ? 'text-accent-text' : 'text-foreground'
			]}
		>
			{line.available}
		</span>
		<div class="grid gap-1.5 pb-1">
			<span class="font-heading text-[30px] leading-[30px] font-bold text-muted-foreground">of {line.assigned}</span>
			<span class="font-mono text-[11px] font-medium tracking-[0.08em] uppercase">Available · {line.percent}%</span>
		</div>
	</div>

	<div class={['flex h-5', line.mode === 'people' ? 'gap-[3px]' : 'gap-0.5']} role="img" aria-label={stripLabel}>
		{#each line.strip as segment (segment.statusTypeId)}
			{@const color = segment.statusTypeId === null ? undefined : statusById.get(segment.statusTypeId)?.color}
			{#if line.mode === 'people'}
				{#each { length: segment.count }, index (index)}
					<span class={['flex-1 rounded-[1px]', color ? '' : 'bg-foreground']} style:background-color={color}></span>
				{/each}
			{:else if segment.count > 0}
				<span
					class={['rounded-[1px]', color ? '' : 'bg-foreground']}
					style:flex-grow={segment.count}
					style:background-color={color}
				></span>
			{/if}
		{/each}
	</div>

	{#if outCount === 0}
		<p class="text-sm text-muted-foreground">Everyone is available today.</p>
	{:else if line.mode === 'people'}
		<ul class={PERSON_ROWS} aria-label="Out today">
			{@render personRows(line.outPeople)}
		</ul>
	{:else}
		<div class="grid gap-2.5">
			<ul
				class="grid grid-cols-[10px_fit-content(9rem)_28px_minmax(0,1fr)_auto] gap-x-2.5"
				aria-label="Out today by status"
			>
				{#each line.outByStatus as row (row.statusTypeId)}
					{@const name = statusById.get(row.statusTypeId)?.name}
					<li class="col-span-full grid h-9 grid-cols-subgrid items-center border-b border-border">
						{@render swatch(row.statusTypeId)}
						<span class="truncate text-sm leading-[18px]" title={name}>{name}</span>
						<span class="font-heading text-lg leading-[22px] font-bold">{row.count}</span>
						<span class="flex min-w-0 text-sm leading-[18px] text-muted-foreground">
							<span class="truncate" title={row.originsLabel}>{row.originsLabel}</span>
							{#if row.moreOrigins > 0}
								<span class="shrink-0 whitespace-pre"> · {row.moreOrigins} more</span>
							{/if}
						</span>
						<span class="font-mono text-xs whitespace-nowrap text-muted-foreground">{row.returnLabel}</span>
					</li>
				{/each}
			</ul>
			<ul id="{uid}-names" class={PERSON_ROWS} aria-label="Everyone out today" hidden={!showAllNames}>
				{@render personRows(line.outPeople)}
			</ul>
			<div>
				<Button
					variant="link"
					size="none"
					class="underline"
					aria-expanded={showAllNames}
					aria-controls="{uid}-names"
					onclick={() => (showAllNames = !showAllNames)}
				>
					{showAllNames ? 'Fewer names' : `All ${outCount} names`}
				</Button>
			</div>
		</div>
	{/if}

	<p class="text-sm leading-[21px] text-secondary-foreground">{line.tomorrow}</p>
</div>
