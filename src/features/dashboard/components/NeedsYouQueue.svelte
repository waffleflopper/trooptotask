<script lang="ts">
	import { AttentionActionRow } from '$lib/components/patterns/readiness-items';
	import { Button } from '$lib/components/ui/button';
	import { needsYouKindInfo, type NeedsYouQueue } from '../sections/needsYou';

	let { queue }: { queue: NeedsYouQueue } = $props();

	let showAll = $state(false);

	const rows = $derived(showAll ? queue.ranked : queue.rows);
</script>

{#if queue.ranked.length === 0}
	<p class="border-t border-foreground py-4 text-sm text-muted-foreground">Nothing needs you right now.</p>
{:else}
	<ul class="border-t border-foreground" aria-label="Needs you">
		{#each rows as item (item.id)}
			{@const kind = needsYouKindInfo(item.kind)}
			<AttentionActionRow
				tone={kind.severity}
				label={kind.label}
				title={item.title}
				subtitle={item.subtitle}
				timing={item.timing}
				href={item.href}
			/>
		{/each}
		{#if queue.fold && !showAll}
			<li class="flex min-h-12 items-center gap-4 border-b border-border pl-[19px]">
				<span
					class="w-[84px] shrink-0 font-mono text-[11px] leading-[14px] font-semibold tracking-[0.08em] text-muted-foreground uppercase"
				>
					+{queue.fold.count} more
				</span>
				<span class="min-w-0 flex-1 truncate text-sm leading-[18px] text-muted-foreground">
					{queue.fold.titles.join(' · ')}
				</span>
				<span class="pr-2">
					<Button variant="link" class="px-0 underline" onclick={() => (showAll = true)}>
						Show all {queue.ranked.length}
					</Button>
				</span>
			</li>
		{/if}
	</ul>
{/if}
