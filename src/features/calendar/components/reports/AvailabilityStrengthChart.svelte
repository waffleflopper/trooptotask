<script lang="ts">
	import { tick } from 'svelte';
	import type { StatusType } from '$features/calendar/contracts';
	import { formatDayMonth, formatWeekdayDayMonth } from '$lib/utils/dates';
	import type { ForecastDay } from '../../utils/calendarReports';

	interface Props {
		days: ForecastDay[];
		statusTypes: readonly StatusType[];
		selectedDate: string | null;
		onSelect: (date: string) => void;
		ariaLabel: string;
	}

	let { days, statusTypes, selectedDate, onSelect, ariaLabel }: Props = $props();

	const COLUMN_MIN_PX = 10;
	const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

	let columns = $state<HTMLElement>();

	const total = $derived(days[0]?.totalPersonnel ?? 0);
	const statusById = $derived(new Map(statusTypes.map((status) => [status.id, status])));
	const legend = $derived(
		statusTypes.filter((status) => days.some((day) => day.awayByStatus.some((away) => away.statusTypeId === status.id)))
	);
	const labelEvery = $derived(days.length <= 31 ? 1 : days.length <= 62 ? 2 : 7);
	const focusable = $derived(days.find((day) => day.date === selectedDate)?.date ?? days[0]?.date);

	function percentOf(count: number): string {
		return `${total > 0 ? (count / total) * 100 : 0}%`;
	}

	function isWeekend(date: string): boolean {
		const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
		return weekday === 0 || weekday === 6;
	}

	function monthLabel(date: string, index: number): string {
		return index === 0 || date.endsWith('-01') ? MONTHS[Number(date.slice(5, 7)) - 1] : '';
	}

	function dayLabel(day: ForecastDay): string {
		return `${formatWeekdayDayMonth(day.date)}: ${day.availableCount} of ${day.totalPersonnel} here, ${day.unavailableCount} away`;
	}

	async function moveSelection(event: KeyboardEvent, index: number): Promise<void> {
		const target =
			event.key === 'ArrowRight'
				? index + 1
				: event.key === 'ArrowLeft'
					? index - 1
					: event.key === 'Home'
						? 0
						: event.key === 'End'
							? days.length - 1
							: null;
		if (target === null || target < 0 || target >= days.length) return;
		event.preventDefault();
		onSelect(days[target].date);
		await tick();
		columns?.querySelector<HTMLElement>(`[data-date="${days[target].date}"]`)?.focus();
	}
</script>

<div class="min-w-0">
	<ul class="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1" aria-label="Chart key">
		<li class="inline-flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
			<span class="size-2.5 rounded-[1px] bg-foreground/15" aria-hidden="true"></span>Here
		</li>
		{#each legend as status (status.id)}
			<li class="inline-flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
				<span class="size-2.5 rounded-[1px]" style:background-color={status.color} aria-hidden="true"
				></span>{status.name}
			</li>
		{/each}
	</ul>

	<div class="flex gap-2">
		<div class="relative h-[260px] w-9 shrink-0 font-mono text-[11px] text-muted-foreground" aria-hidden="true">
			<span class="absolute top-0 right-0 -translate-y-1/2">{total}</span>
			<span class="absolute right-0 -translate-y-1/2" style:top="20%">80%</span>
			<span class="absolute right-0 -translate-y-1/2" style:top="50%">50%</span>
		</div>
		<div class="min-w-0 flex-1 overflow-x-auto pb-1">
			<div class="relative" style:min-width="{days.length * (COLUMN_MIN_PX + 2)}px">
				<div class="relative h-[260px]">
					<div bind:this={columns} role="group" aria-label={ariaLabel} class="relative flex h-full gap-[2px]">
						{#each days as day, index (day.date)}
							{@const selected = day.date === selectedDate}
							<button
								type="button"
								data-date={day.date}
								aria-pressed={selected}
								aria-label={dayLabel(day)}
								tabindex={day.date === focusable ? 0 : -1}
								class="flex h-full min-w-0 flex-1 flex-col-reverse rounded-[2px] outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-background {selected
									? 'outline-2 outline-offset-2 outline-foreground'
									: ''}"
								onclick={() => onSelect(day.date)}
								onkeydown={(event) => moveSelection(event, index)}
							>
								<span
									class={selected ? 'bg-foreground' : 'bg-foreground/15'}
									style:height={percentOf(day.availableCount)}
								></span>
								{#each day.awayByStatus as away (away.statusTypeId)}
									<span
										style:height={percentOf(away.count)}
										style:background-color={statusById.get(away.statusTypeId)?.color ?? '#999'}
									></span>
								{/each}
							</button>
						{/each}
					</div>
					<div
						class="pointer-events-none absolute inset-x-0 border-t border-dashed border-foreground"
						style:top="20%"
						aria-hidden="true"
					></div>
					<div
						class="pointer-events-none absolute inset-x-0 border-t border-dashed border-muted-foreground"
						style:top="50%"
						aria-hidden="true"
					></div>
				</div>
				<div class="mt-2 flex gap-[2px] font-mono text-[11px] leading-4 text-muted-foreground" aria-hidden="true">
					{#each days as day, index (day.date)}
						<span class="flex min-w-0 flex-1 flex-col items-center overflow-visible">
							<span
								class={[
									'whitespace-nowrap',
									day.date === selectedDate && 'font-semibold text-foreground',
									day.date !== selectedDate && isWeekend(day.date) && 'opacity-60',
									days.length > 14 && days.length <= 31 && index % 2 === 1 && 'max-sm:invisible'
								]}
							>
								{index % labelEvery === 0 ? Number(day.date.slice(8)) : ''}
							</span>
							<span class="whitespace-nowrap uppercase">{monthLabel(day.date, index)}</span>
						</span>
					{/each}
				</div>
			</div>
		</div>
	</div>
	<p class="mt-1 pl-11 font-mono text-[11px] text-muted-foreground">
		Click a day to list who's out
		{#if days.length > 0}
			· {formatDayMonth(days[0].date)} to {formatDayMonth(days[days.length - 1].date)}
		{/if}
	</p>
</div>
