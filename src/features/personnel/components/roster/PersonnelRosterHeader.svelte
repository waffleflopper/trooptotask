<script lang="ts">
	import * as PageShell from '$lib/components/patterns/page-shell';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import type { SummaryState } from '../../rosterSignals';

	interface Props {
		unitName: string;
		activeCount: number;
		summary: SummaryState;
		/** False for a viewer who cannot read availability: no strip, not even placeholders. */
		canViewAvailability: boolean;
	}

	let { unitName, activeCount, summary, canViewAvailability }: Props = $props();

	const presence = $derived(
		summary.kind === 'ready' && summary.value.presence.kind === 'known' ? summary.value.presence.value : null
	);
	const showStrip = $derived(canViewAvailability && (summary.kind === 'pending' || presence !== null));
</script>

{#snippet count()}
	<span class="font-heading text-2xl font-semibold text-muted-foreground tabular-nums sm:text-3xl">{activeCount}</span>
{/snippet}

{#snippet strip()}
	<ul class="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm" aria-label="Today's headcount">
		{#if presence}
			<li class="flex items-center gap-1.5">
				<span class="size-2 shrink-0 rounded-full bg-success" aria-hidden="true"></span>
				<span class="font-semibold tabular-nums">{presence.present}</span>
				<span class="text-muted-foreground">present</span>
			</li>
			{#each presence.byStatus as entry (entry.type.id)}
				<li class="flex items-center gap-1.5">
					<span class="size-2 shrink-0 rounded-full" style:background-color={entry.type.color} aria-hidden="true"
					></span>
					<span class="font-semibold tabular-nums">{entry.count}</span>
					<span class="text-muted-foreground">{entry.type.name}</span>
				</li>
			{/each}
		{:else}
			{#each [0, 1, 2] as placeholder (placeholder)}
				<li class="flex h-5 items-center gap-1.5" aria-hidden="true">
					<Skeleton class="size-2 rounded-full" />
					<Skeleton class="h-3.5 w-16" />
				</li>
			{/each}
		{/if}
	</ul>
{/snippet}

<PageShell.Header
	eyebrow="{unitName} · Active roster"
	title="Personnel"
	variant="display"
	meta={count}
	aside={showStrip ? strip : undefined}
/>
