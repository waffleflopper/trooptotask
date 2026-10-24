<script lang="ts">
	import * as PageShell from '$lib/components/patterns/page-shell';
	import type { Snippet } from 'svelte';
	import XIcon from '@lucide/svelte/icons/x';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { Toggle } from '$lib/components/ui/toggle';
	import { sameRosterFilter } from '../../rosterFilter';
	import type { RosterFilter, SummaryState } from '../../rosterSignals';

	interface Props {
		unitName: string;
		activeCount: number;
		summary: SummaryState;
		/** False for a viewer who cannot read availability: no strip, not even placeholders. */
		canViewAvailability: boolean;
		/** The active roster filter; a headcount entry that carries it is drawn pressed. */
		filter: RosterFilter | null;
		onToggleFilter: (filter: RosterFilter) => void;
	}

	let { unitName, activeCount, summary, canViewAvailability, filter, onToggleFilter }: Props = $props();

	const presence = $derived(
		summary.kind === 'ready' && summary.value.presence.kind === 'known' ? summary.value.presence.value : null
	);
	const showStrip = $derived(canViewAvailability && (summary.kind === 'pending' || presence !== null));
</script>

{#snippet count()}
	<span class="font-heading text-2xl font-semibold text-muted-foreground tabular-nums sm:text-3xl">{activeCount}</span>
{/snippet}

{#snippet entry(target: RosterFilter, count: number, label: string, dot: Snippet)}
	{@const active = sameRosterFilter(filter, target)}
	<li>
		<Toggle
			variant="pill"
			size="chip"
			class="text-sm"
			disabled={count === 0 && !active}
			pressed={active}
			onPressedChange={() => onToggleFilter(target)}
		>
			{@render dot()}
			<span class="font-semibold tabular-nums">{count}</span>
			<span class={active ? 'text-background/75' : 'text-muted-foreground'}>{label}</span>
			{#if active}
				<XIcon class="size-2.75" aria-hidden="true" />
			{/if}
		</Toggle>
	</li>
{/snippet}

{#snippet presentDot()}
	<span class="size-2 shrink-0 rounded-full bg-success" aria-hidden="true"></span>
{/snippet}

{#snippet strip()}
	<ul class="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm" aria-label="Today's headcount">
		{#if presence}
			{@render entry({ kind: 'present' }, presence.present, 'present', presentDot)}
			{#each presence.byStatus as { type, count } (type.id)}
				{#snippet statusDot()}
					<span class="size-2 shrink-0 rounded-full" style:background-color={type.color} aria-hidden="true"></span>
				{/snippet}
				{@render entry({ kind: 'status', statusTypeId: type.id }, count, type.name, statusDot)}
			{/each}
		{:else}
			{#each [0, 1, 2] as placeholder (placeholder)}
				<li class="flex h-7.5 items-center gap-1.5 px-3" aria-hidden="true">
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
