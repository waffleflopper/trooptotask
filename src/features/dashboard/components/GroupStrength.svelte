<script lang="ts">
	import { SvelteSet } from 'svelte/reactivity';
	import { Button } from '$lib/components/ui/button';
	import type { GroupStrength, GroupStrengthRow } from '../read-model/strengthBand';

	let { groups, mode }: { groups: GroupStrength; mode: 'people' | 'counts' } = $props();

	const uid = $props.id();
	let showAll = $state(false);
	const expanded = new SvelteSet<string>();

	const total = $derived(groups.sets.length);
	const folded = $derived(groups.shown < total);
	const nested = $derived(groups.sets.some((set) => set.below.length > 0));
	const visible = $derived(
		(showAll ? groups.sets : groups.sets.slice(0, groups.shown)).flatMap((set) => [
			{ row: set.top, parent: set.below.length > 0 },
			...(expanded.has(set.top.id) ? set.below.map((row) => ({ row, parent: false })) : [])
		])
	);
	const eyebrow = $derived(
		folded && !showAll ? `By group · lowest ${groups.shown} of ${total}` : `By group · all ${total} · lowest first`
	);
</script>

{#snippet count(row: GroupStrengthRow)}
	<span
		class={['font-mono text-[13px]', row.belowFloor ? 'font-semibold text-accent-text' : 'text-secondary-foreground']}
	>
		{row.available}/{row.assigned}<span class="sr-only"
			>{row.belowFloor ? ' available, below the floor' : ' available'}</span
		>
	</span>
{/snippet}

{#if total > 0}
	<div class="grid gap-2.5">
		{#if mode === 'counts' || nested}
			<h3 class="font-mono text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase">{eyebrow}</h3>
		{/if}
		{#if mode === 'people' && !nested}
			<ul
				id="{uid}-groups"
				class="flex flex-wrap gap-y-2 border-t border-border pt-3.5"
				aria-label="Available by group"
			>
				{#each visible as { row } (row.id)}
					<li class="flex min-w-24 flex-1 items-baseline gap-2">
						<span class="font-heading text-base font-bold tracking-[0.02em] uppercase">{row.name}</span>
						{@render count(row)}
					</li>
				{/each}
			</ul>
		{:else}
			<ul id="{uid}-groups" class="border-t border-foreground" aria-label="Available by group">
				{#each visible as { row, parent } (row.id)}
					{@const open = expanded.has(row.id)}
					<li class="flex h-[38px] items-center gap-3.5 border-b border-border" data-band-level={row.level}>
						{#if parent}
							<Button
								variant="cell"
								size="none"
								class="h-full w-[150px] shrink-0 justify-start gap-1.5 font-heading text-base leading-5 font-bold uppercase"
								aria-expanded={open}
								onclick={() => (open ? expanded.delete(row.id) : expanded.add(row.id))}
							>
								<span class="w-3 shrink-0 font-mono text-[10px]" aria-hidden="true">{open ? '▼' : '▶'}</span>
								<span class="truncate">{row.name}</span>
							</Button>
						{:else}
							<span
								class={[
									'shrink-0 truncate font-heading leading-5 uppercase',
									nested ? 'w-[150px]' : 'w-[110px]',
									row.level === 0 || row.subtotal ? 'text-base font-bold' : 'text-sm font-semibold'
								]}
								style:padding-left={nested ? `calc(${row.level}rem + 18px)` : undefined}>{row.name}</span
							>
						{/if}
						<span class="h-2 flex-1 bg-border" aria-hidden="true">
							<span
								class={['block h-full', row.belowFloor ? 'bg-accent-text' : 'bg-foreground']}
								style:width="{row.percent}%"
							></span>
						</span>
						<span class="w-14 shrink-0 text-right">{@render count(row)}</span>
					</li>
				{/each}
			</ul>
		{/if}
		{#if folded}
			<div>
				<Button
					variant="link"
					size="none"
					class="underline"
					aria-expanded={showAll}
					aria-controls="{uid}-groups"
					onclick={() => (showAll = !showAll)}
				>
					{showAll ? 'Fewer groups' : `All ${total} groups`}
				</Button>
			</div>
		{/if}
	</div>
{/if}
