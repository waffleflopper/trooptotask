<script lang="ts">
	import { formatWeekdayDay } from '$lib/utils/dates';
	import { fromDayNumber, toDayNumber } from '$lib/utils/dayNumber';
	import type { DashboardScreenModel } from '../read-model/dashboardScreenModel.svelte';
	import { tonightAndTomorrow } from '../sections/onDuty';

	let { model }: { model: DashboardScreenModel } = $props();

	const rows = $derived(tonightAndTomorrow(model.inputs));
	const tomorrow = $derived(fromDayNumber(toDayNumber(model.today) + 1));

	const DAY_HEAD = 'w-[110px] shrink-0 font-mono text-[11px] leading-[14px] tracking-[0.08em] uppercase';
</script>

{#if rows.length === 0}
	<p class="border-t border-foreground py-4 text-sm text-muted-foreground">No duties are shown on the Calendar.</p>
{:else}
	<table class="w-full table-fixed border-t border-foreground">
		<thead>
			<tr class="h-[30px] border-b border-border">
				<th scope="col"><span class="sr-only">Duty</span></th>
				<th scope="col" class="{DAY_HEAD} text-left font-semibold text-foreground">{formatWeekdayDay(model.today)}</th>
				<th scope="col" class="{DAY_HEAD} text-left font-medium text-muted-foreground">{formatWeekdayDay(tomorrow)}</th>
			</tr>
		</thead>
		<tbody>
			{#each rows as row (row.assignmentTypeId)}
				<tr class="h-11 border-b border-border">
					<th scope="row" class="py-2 pr-2 text-left font-normal">
						<span class="flex min-w-0 items-center gap-2">
							<span class="size-2 shrink-0 rounded-[2px]" style:background-color={row.color} aria-hidden="true"></span>
							<span
								class="min-w-0 font-mono text-[11px] leading-[14px] font-medium tracking-[0.08em] wrap-break-word text-foreground uppercase"
							>
								{row.name}
							</span>
						</span>
					</th>
					<td
						class="w-[110px] truncate py-2 pr-2 text-[15px] leading-[18px] font-semibold text-foreground"
						title={row.today ?? undefined}
					>
						{row.today ?? 'Open'}
					</td>
					<td
						class="w-[110px] truncate py-2 text-[15px] leading-[18px] text-muted-foreground"
						title={row.tomorrow ?? undefined}
					>
						{row.tomorrow ?? 'Open'}
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
{/if}
