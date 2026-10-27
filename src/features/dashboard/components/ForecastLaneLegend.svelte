<script lang="ts">
	import type { DashboardForecastLaneView } from '../sections/forecastLanes';

	let { lanes }: { lanes: readonly DashboardForecastLaneView[] } = $props();
</script>

{#each lanes as lane (lane.id)}
	{#each lane.legend as entry (entry.kind)}
		<li class="flex items-center gap-[5px]">
			{#if entry.kind === 'span'}
				<span class="h-2 w-3.5 rounded-[2px] bg-foreground" aria-hidden="true"></span>
			{:else}
				<span class="size-[7px] rotate-45 bg-foreground" aria-hidden="true"></span>
			{/if}
			{entry.label}
		</li>
	{/each}
{/each}
