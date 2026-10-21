<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import type { GroupStrength, GroupStrengthRow } from '../read-model/strengthBand';

	let { groups, mode }: { groups: GroupStrength; mode: 'people' | 'counts' } = $props();

	const uid = $props.id();
	let showAll = $state(false);

	const total = $derived(groups.rows.length);
	const folded = $derived(groups.shown < total);
	const visible = $derived(showAll ? groups.rows : groups.rows.slice(0, groups.shown));
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
	{#if mode === 'people'}
		<ul class="flex flex-wrap gap-x-8 gap-y-2 border-t border-border pt-3.5" aria-label="Available by group">
			{#each groups.rows as row (row.id)}
				<li class="flex items-baseline gap-2">
					<span class="font-heading text-base font-bold tracking-[0.02em] uppercase">{row.name}</span>
					{@render count(row)}
				</li>
			{/each}
		</ul>
	{:else}
		<div class="grid gap-2.5">
			<h3 class="font-mono text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase">{eyebrow}</h3>
			<ul id="{uid}-groups" class="border-t border-foreground" aria-label="Available by group">
				{#each visible as row (row.id)}
					<li class="flex h-[38px] items-center gap-3 border-b border-border">
						<span class="w-[110px] shrink-0 truncate text-sm font-semibold">{row.name}</span>
						<span class="h-2 flex-1 bg-border" aria-hidden="true">
							<span
								class={['block h-full', row.belowFloor ? 'bg-accent-text' : 'bg-secondary-foreground']}
								style:width="{row.percent}%"
							></span>
						</span>
						<span class="w-14 shrink-0 text-right">{@render count(row)}</span>
					</li>
				{/each}
			</ul>
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
{/if}
