<script lang="ts">
	import type { DashboardForecastLaneView } from '../read-model/dashboardScreenModel.svelte';

	let { days, lanes }: { days: readonly string[]; lanes: readonly DashboardForecastLaneView[] } = $props();
</script>

{#each lanes as lane (lane.id)}
	<ul
		class="grid grid-flow-row-dense gap-x-1.5 gap-y-1 border-t border-border pt-2"
		style:grid-template-columns="repeat({days.length}, minmax(0, 1fr))"
		aria-label={lane.label}
	>
		{#each lane.marks as mark (mark.id)}
			<li class="min-w-0" style:grid-column="{mark.column} / span {mark.span}">
				{#if mark.kind === 'span'}
					<span
						class={[
							'block h-[22px] truncate rounded-[3px] px-2 text-[13px] leading-[22px]',
							mark.emphasis === 'strong'
								? 'bg-foreground font-semibold text-background'
								: 'border border-border bg-muted text-muted-foreground italic'
						]}
					>
						{mark.label}
					</span>
				{:else}
					<span class="flex h-[22px] items-center justify-center" title={mark.label}>
						<span class="size-2.5 rotate-45 bg-foreground" aria-hidden="true"></span>
						<span class="sr-only">{mark.label}</span>
					</span>
				{/if}
			</li>
		{/each}
	</ul>
{/each}
