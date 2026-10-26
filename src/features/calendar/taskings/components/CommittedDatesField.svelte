<script lang="ts">
	import CalendarIcon from '@lucide/svelte/icons/calendar';
	import { parseDate } from '@internationalized/date';
	import type { DateRange } from 'bits-ui';
	import { Button } from '$lib/components/ui/button';
	import { getFieldContext } from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import * as Popover from '$lib/components/ui/popover';
	import { RangeCalendar } from '$lib/components/ui/range-calendar';
	import { formatDayMonth, formatWeekdayDay } from '$lib/utils/dates';
	import { cn } from '$lib/utils';

	interface Props {
		id: string;
		startsOn: string;
		endsOn: string;
		reportTime: string;
		onChange: (next: { startsOn: string; endsOn: string; reportTime: string }) => void;
	}

	let { id, startsOn, endsOn, reportTime, onChange }: Props = $props();

	let open = $state(false);
	const field = getFieldContext();
	const fieldAria = $derived(field?.controlAria(undefined, undefined) ?? {});

	const month = (date: string) => formatDayMonth(date).split(' ')[1];
	const dates = $derived.by(() => {
		if (!startsOn || !endsOn) return '';
		if (startsOn === endsOn) return `${formatWeekdayDay(startsOn)} ${month(startsOn)}`;
		const start =
			startsOn.slice(0, 7) === endsOn.slice(0, 7)
				? formatWeekdayDay(startsOn)
				: `${formatWeekdayDay(startsOn)} ${month(startsOn)}`;
		return `${start} – ${formatWeekdayDay(endsOn)} ${month(endsOn)}`;
	});
	const range = $derived<DateRange>({
		start: startsOn ? safeParse(startsOn) : undefined,
		end: endsOn ? safeParse(endsOn) : undefined
	});

	function safeParse(value: string) {
		try {
			return parseDate(value);
		} catch {
			return undefined;
		}
	}

	function chooseRange(next: DateRange | undefined) {
		if (!next?.start || !next.end) return;
		onChange({ startsOn: next.start.toString(), endsOn: next.end.toString(), reportTime });
	}
</script>

<Popover.Root bind:open>
	<Popover.Trigger {id} {...fieldAria}>
		{#snippet child({ props })}
			<Button
				{...props}
				variant="outline"
				class={cn('w-full justify-start text-left font-normal', !dates && 'text-muted-foreground')}
			>
				<CalendarIcon />
				{#if dates}
					<span class="truncate font-mono text-[13px]">{dates}</span>
					{#if reportTime}
						<span class="shrink-0 font-mono text-xs text-muted-foreground">· report {reportTime.replace(':', '')}</span>
					{/if}
				{:else}
					<span class="truncate">Choose dates</span>
				{/if}
			</Button>
		{/snippet}
	</Popover.Trigger>
	<Popover.Content class="w-auto overflow-hidden p-0" align="start">
		<RangeCalendar value={range} captionLayout="dropdown" onValueChange={chooseRange} />
		<div class="flex flex-wrap items-end gap-2 border-t p-2">
			<label class="grid gap-1 text-xs font-medium">
				Report time
				<Input
					type="time"
					class="h-8 w-28"
					disabled={!dates}
					value={reportTime}
					oninput={(input) => onChange({ startsOn, endsOn, reportTime: input.currentTarget.value })}
				/>
			</label>
			<span class="flex-1"></span>
			{#if dates}
				<Button
					variant="ghost"
					size="sm"
					onclick={() => {
						onChange({ startsOn: '', endsOn: '', reportTime: '' });
						open = false;
					}}
				>
					Clear
				</Button>
			{/if}
			<Button size="sm" onclick={() => (open = false)}>Done</Button>
		</div>
	</Popover.Content>
</Popover.Root>
