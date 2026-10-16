<script lang="ts">
	import type { LegendSource } from '$features/calendar/utils/calendarLegend';

	let { sources }: { sources: readonly LegendSource[] } = $props();

	const shown = $derived(sources.filter((source) => source.entries.length > 0));
	const hints = $derived(shown.flatMap((source) => (source.hint ? [source.hint] : [])));
</script>

{#if shown.length > 0}
	<div
		role="group"
		aria-label="Calendar legend"
		class="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 px-1 py-0.5 text-xs text-foreground"
	>
		{#each shown as source, index (source.key)}
			{#if index > 0}
				<span aria-hidden="true" class="h-4 w-px bg-border"></span>
			{/if}
			<ul aria-label={source.label} class="flex flex-wrap items-center gap-x-3 gap-y-1.5">
				{#each source.entries as entry (entry.key)}
					<li class="flex items-center gap-1.5">
						<entry.mark.Mark value={entry.mark.value} />
						{entry.label}
					</li>
				{/each}
			</ul>
		{/each}
		{#each hints as hint (hint)}
			<p class="ml-auto font-mono text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">{hint}</p>
		{/each}
	</div>
{/if}
