<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import ArrowLeftIcon from '@lucide/svelte/icons/arrow-left';
	import PrinterIcon from '@lucide/svelte/icons/printer';
	import * as PageShell from '$lib/components/patterns/page-shell';
	import { Button } from '$lib/components/ui/button';
	import * as ButtonGroup from '$lib/components/ui/button-group';
	import * as Empty from '$lib/components/ui/empty';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import * as ToggleGroup from '$lib/components/ui/toggle-group';
	import CalendarPeriodNavigation from '../CalendarPeriodNavigation.svelte';
	import Da6Form from './Da6Form.svelte';
	import Da6ShowTheWork from './Da6ShowTheWork.svelte';
	import {
		da6Href,
		defaultDay,
		headerDate,
		monthAnchor,
		monthOfAnchor,
		monthTitle,
		type Da6DayRef,
		type Da6View
	} from '../../utils/da6View';

	interface Props {
		orgName: string;
		orgUrlSegment: string;
		typeId: string;
		month: string;
		/** Null while the month loads. */
		view: Da6View | null;
	}

	let { orgName, orgUrlSegment, typeId, month, view }: Props = $props();

	let picked = $state.raw<{ view: Da6View; day: Da6DayRef } | null>(null);
	const day = $derived(view && (picked?.view === view ? picked.day : defaultDay(view.sheets, view.today)));

	function open(nextTypeId: string, nextMonth: string) {
		// A single toggle group emits '' when the pressed item is clicked again.
		if (!nextTypeId) return;
		goto(resolve(da6Href(orgUrlSegment, nextTypeId, nextMonth) as `/org/${string}`));
	}
</script>

<div class="mx-auto flex max-w-[1600px] min-w-0 flex-col gap-4 px-4 py-4 sm:px-6 sm:pb-6" data-print-report="da6">
	<div class="print:hidden">
		<CalendarPeriodNavigation
			view="month"
			anchor={monthAnchor(month)}
			onAnchorChange={(anchor) => open(typeId, monthOfAnchor(anchor))}
		>
			{#snippet layout({ monthPicker, previous, next, today })}
				{#snippet aside()}
					{#if view}
						<ToggleGroup.Root
							type="single"
							size="sm"
							value={view.roster.id}
							onValueChange={(id) => open(id, month)}
							aria-label="Duty roster"
						>
							{#each view.rosters as roster (roster.id)}
								<ToggleGroup.Item value={roster.id} title={roster.name} aria-label={roster.name}>
									{roster.shortName}
								</ToggleGroup.Item>
							{/each}
						</ToggleGroup.Root>
					{:else}
						<Skeleton class="h-8 w-24 rounded-lg" aria-hidden="true" />
					{/if}
					<div class="flex items-center gap-2">
						{@render today()}
						<ButtonGroup.Root aria-label="DA 6 month">
							{@render previous()}
							{@render monthPicker({ variant: 'outline', size: 'sm', class: 'font-display tracking-wide uppercase' })}
							{@render next()}
						</ButtonGroup.Root>
					</div>
					<Button variant="outline" size="sm" href={`/org/${orgUrlSegment}/calendar/assignments`}>
						<ArrowLeftIcon aria-hidden="true" />
						Back to planner
					</Button>
					<Button size="sm" disabled={!view?.sheets.length} onclick={() => window.print()}>
						<PrinterIcon aria-hidden="true" />
						Print DA 6
					</Button>
				{/snippet}
				<PageShell.Header
					eyebrow="Calendar · Duty roster"
					title={view ? `DA 6 · ${view.roster.name}` : 'DA 6'}
					variant="display"
					{aside}
				/>
			{/snippet}
		</CalendarPeriodNavigation>
	</div>

	<p class="hidden font-mono text-xs tracking-[0.08em] uppercase print:block">
		DA Form 6 · Duty roster · {monthTitle(month)}
	</p>

	{#if !view}
		<div class="grid gap-3" role="status" aria-live="polite">
			<p class="sr-only">Loading the DA 6</p>
			<Skeleton class="h-16 w-full rounded-lg" aria-hidden="true" />
			<Skeleton class="h-96 w-full rounded-lg" aria-hidden="true" />
		</div>
	{:else if !view.sheets.length}
		<Empty.Root class="min-h-64 border bg-card">
			<Empty.Header>
				<h2 class="text-lg font-semibold">No duty days in {monthTitle(month)}</h2>
				<Empty.Description>
					This DA 6 shows a column for each day someone is assigned {view.roster.name}.
				</Empty.Description>
			</Empty.Header>
		</Empty.Root>
	{:else}
		{#each view.sheets as sheet, index (sheet.segment.formId)}
			{#if index > 0}
				<p
					class="border-y border-dashed py-2 text-center font-mono text-xs tracking-[0.06em] text-muted-foreground uppercase"
					role="note"
				>
					Form closed {headerDate(view.sheets[index - 1].to ?? sheet.from)}. A new DA 6 opened {headerDate(sheet.from)}
					when the roster rules changed.
				</p>
			{/if}
			<Da6Form
				{sheet}
				{orgName}
				today={view.today}
				selectedColumn={day?.sheet === index ? day.column : null}
				onSelectDay={(column) => {
					if (view) picked = { view, day: { sheet: index, column } };
				}}
			/>
		{/each}
		{#if day}
			<Da6ShowTheWork sheet={view.sheets[day.sheet]} column={day.column} />
		{/if}
	{/if}
</div>
