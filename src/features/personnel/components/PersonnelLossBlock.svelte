<script lang="ts">
	import { formatDayMonth, formatDayMonthYear } from '$lib/utils/dates';
	import type { PersonnelLossDate, PersonnelLossReadiness } from '../personnelReadiness.types';

	let { loss }: { loss: PersonnelLossReadiness } = $props();

	function remaining({ date, daysRemaining }: PersonnelLossDate): string {
		const count = Math.abs(daysRemaining);
		const days = `${count} ${count === 1 ? 'day' : 'days'}`;
		return `${formatDayMonthYear(date)} · ${daysRemaining < 0 ? `${days} ago` : days}`;
	}

	const dates = $derived([
		['ETS', loss.ets],
		['PCS / DEROS', loss.deros]
	] as const);
</script>

<section class="flex flex-col gap-2 px-1" aria-labelledby="loss-heading">
	<h2
		id="loss-heading"
		class="font-mono text-[0.6875rem] leading-[14px] font-medium tracking-[0.08em] text-muted-foreground uppercase"
	>
		Loss
	</h2>
	<dl class="grid grid-cols-[6rem_1fr] items-baseline gap-x-3 gap-y-2 text-sm">
		{#each dates as [label, value] (label)}
			<dt class="text-muted-foreground">{label}</dt>
			{#if value}
				<dd class="font-medium text-foreground">{remaining(value)}</dd>
			{:else}
				<dd class="text-muted-foreground">None on file</dd>
			{/if}
		{/each}
	</dl>
	{#if loss.inWindow}
		<p class="text-[13px] leading-[18px] text-warning-foreground">
			Inside the {loss.windowDays}-day loss window since {formatDayMonth(loss.inWindow.enteredOn)}
		</p>
	{/if}
</section>
