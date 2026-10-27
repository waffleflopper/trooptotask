<script lang="ts">
	import { RangeCalendar as RangeCalendarPrimitive } from 'bits-ui';
	import type { ComponentProps } from 'svelte';
	import * as Calendar from '$lib/components/ui/calendar/index.js';
	import type { ButtonVariant } from '$lib/components/ui/button/index.js';
	import { cn, type WithoutChildrenOrChild } from '$lib/utils.js';
	import RangeCalendarCell from './range-calendar-cell.svelte';
	import RangeCalendarDay from './range-calendar-day.svelte';

	let {
		ref = $bindable(null),
		value = $bindable(),
		placeholder = $bindable(),
		class: className,
		weekdayFormat = 'short',
		buttonVariant = 'ghost',
		captionLayout = 'label',
		locale = 'en-US',
		monthFormat: monthFormatProp,
		yearFormat = 'numeric',
		...restProps
	}: WithoutChildrenOrChild<RangeCalendarPrimitive.RootProps> & {
		buttonVariant?: ButtonVariant;
		captionLayout?: ComponentProps<typeof Calendar.Caption>['captionLayout'];
		monthFormat?: ComponentProps<typeof Calendar.Caption>['monthFormat'];
		yearFormat?: ComponentProps<typeof Calendar.Caption>['yearFormat'];
	} = $props();

	const monthFormat = $derived(monthFormatProp ?? (captionLayout.startsWith('dropdown') ? 'short' : 'long'));
</script>

<RangeCalendarPrimitive.Root
	bind:value
	bind:ref
	bind:placeholder
	{weekdayFormat}
	{locale}
	class={cn(
		'p-2 [--cell-radius:var(--radius)] [--cell-size:--spacing(7)] bg-background group/calendar in-data-[slot=popover-content]:bg-transparent',
		className
	)}
	{...restProps}
>
	{#snippet children({ months, weekdays })}
		<Calendar.Months>
			<Calendar.Nav>
				<Calendar.PrevButton variant={buttonVariant} />
				<Calendar.NextButton variant={buttonVariant} />
			</Calendar.Nav>
			{#each months as month, monthIndex (month)}
				<Calendar.Month>
					<Calendar.Header>
						<Calendar.Caption
							{captionLayout}
							months={undefined}
							{monthFormat}
							years={undefined}
							{yearFormat}
							month={month.value}
							bind:placeholder
							{locale}
							{monthIndex}
						/>
					</Calendar.Header>
					<Calendar.Grid>
						<Calendar.GridHead>
							<Calendar.GridRow class="select-none">
								{#each weekdays as weekday, i (i)}
									<Calendar.HeadCell>{weekday.slice(0, 2)}</Calendar.HeadCell>
								{/each}
							</Calendar.GridRow>
						</Calendar.GridHead>
						<Calendar.GridBody>
							{#each month.weeks as weekDates (weekDates)}
								<Calendar.GridRow class="mt-2 w-full">
									{#each weekDates as date (date)}
										<RangeCalendarCell {date} month={month.value}>
											<RangeCalendarDay />
										</RangeCalendarCell>
									{/each}
								</Calendar.GridRow>
							{/each}
						</Calendar.GridBody>
					</Calendar.Grid>
				</Calendar.Month>
			{/each}
		</Calendar.Months>
	{/snippet}
</RangeCalendarPrimitive.Root>
