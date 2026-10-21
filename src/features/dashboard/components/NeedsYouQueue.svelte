<script lang="ts">
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import { Button } from '$lib/components/ui/button';
	import { needsYouKindInfo, type NeedsYouQueue, type NeedsYouSeverity } from '../sections/needsYou';

	let { queue }: { queue: NeedsYouQueue } = $props();

	let showAll = $state(false);

	const rows = $derived(showAll ? queue.ranked : queue.rows);

	const SEVERITY: Record<NeedsYouSeverity, { rule: string; text: string }> = {
		danger: { rule: 'border-l-destructive', text: 'text-destructive' },
		warning: { rule: 'border-l-accent', text: 'text-accent-text' },
		info: { rule: 'border-l-border', text: 'text-muted-foreground' }
	};
</script>

{#if queue.ranked.length === 0}
	<p class="border-t border-foreground py-4 text-sm text-muted-foreground">Nothing needs you right now.</p>
{:else}
	<ul class="border-t border-foreground" aria-label="Needs you">
		{#each rows as item (item.id)}
			{@const kind = needsYouKindInfo(item.kind)}
			{@const tone = SEVERITY[kind.severity]}
			<li>
				<a
					href={item.href}
					class={[
						'grid min-h-[72px] grid-cols-[84px_minmax(0,1fr)_84px_28px] items-center gap-4 border-b border-l-[3px] border-b-border py-3 pl-4 hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none',
						tone.rule
					]}
				>
					<span class={['font-mono text-[11px] font-semibold tracking-[0.08em] uppercase', tone.text]}>
						{kind.label}
					</span>
					<span class="grid min-w-0 gap-[3px]">
						<span class="text-base leading-[22px] font-semibold text-foreground">{item.title}</span>
						<span class="text-sm text-muted-foreground">{item.subtitle}</span>
					</span>
					<span class={['text-right font-mono text-xs', tone.text]}>{item.timing}</span>
					<ChevronRightIcon class="size-3.5 text-muted-foreground" aria-hidden="true" />
				</a>
			</li>
		{/each}
		{#if queue.fold && !showAll}
			<li class="flex min-h-12 items-center gap-4 border-b border-border pl-[19px]">
				<span
					class="w-[84px] shrink-0 font-mono text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase"
				>
					+{queue.fold.count} more
				</span>
				<span class="min-w-0 flex-1 truncate text-sm text-muted-foreground">{queue.fold.titles.join(' · ')}</span>
				<Button variant="link" onclick={() => (showAll = true)}>Show all {queue.ranked.length}</Button>
			</li>
		{/if}
	</ul>
{/if}
