<script lang="ts">
	import { AvailabilityStrip } from '$lib/components/patterns/calendar-bars';
	import type { PersonnelCalendarWindow } from '../calendar.types';
	import { buildPersonnelNextDays } from '../utils/personnelNextDays';

	let { calendar }: { calendar: PersonnelCalendarWindow } = $props();

	const days = $derived(buildPersonnelNextDays(calendar));
</script>

<div class="flex min-w-0 flex-col gap-3">
	<div class="overflow-x-auto">
		<div class="min-w-[34rem]">
			<AvailabilityStrip size="regular" columns={days.columns} layout={days.layout} />
		</div>
	</div>
	{#if days.legend.length > 0}
		<ul class="flex flex-wrap gap-x-5 gap-y-1 text-sm">
			{#each days.legend as item (item.key)}
				<li><span class="font-semibold">{item.name}</span> <span class="text-muted-foreground">{item.detail}</span></li>
			{/each}
		</ul>
	{:else}
		<p class="text-sm text-muted-foreground">Nothing on the Calendar for the next 14 days.</p>
	{/if}
</div>
