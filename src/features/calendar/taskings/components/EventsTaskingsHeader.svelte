<script lang="ts">
	import type { Snippet } from 'svelte';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import * as PageShell from '$lib/components/patterns/page-shell';
	import { Button } from '$lib/components/ui/button';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { formatWeekdayDayMonth } from '$lib/utils/dates';

	interface Props {
		orgUrlSegment: string;
		section: 'events' | 'taskings';
		/** Null while a record's title loads. */
		title: string | null;
		/** List pages put the viewer's day in the eyebrow. */
		today?: string;
		/** Detail pages name their list in the eyebrow and link back to it. */
		detail?: boolean;
		/** The page's primary commands, top right. */
		actions?: Snippet;
		/** The end of the navigation strip: filters on a list; status, links and the overflow menu on a record. */
		strip?: Snippet;
	}

	let { orgUrlSegment, section, title, today, detail = false, actions, strip }: Props = $props();

	const base = $derived(`/org/${orgUrlSegment}/calendar`);
	const sectionLabel = $derived(section === 'events' ? 'Events' : 'Taskings');
	const eyebrow = $derived(
		detail
			? `Calendar / Events & Taskings / ${sectionLabel}`
			: `Calendar / Events & Taskings${today ? ` · ${formatWeekdayDayMonth(today)} ${today.slice(0, 4)}` : ''}`
	);
	const tabs = $derived([
		{ label: 'Events', href: `/org/${orgUrlSegment}/calendar/events` as const, active: section === 'events' },
		{ label: 'Taskings', href: `/org/${orgUrlSegment}/calendar/taskings` as const, active: section === 'taskings' }
	]);
</script>

{#snippet headline()}
	{#if title === null}
		<Skeleton class="inline-block h-8 w-72 max-w-full align-middle" />
		<span class="sr-only">Loading</span>
	{:else}
		{title}
	{/if}
{/snippet}

<!-- The strip's end takes its own row below the container breakpoint, so filters and record controls never squeeze the tabs. -->
<div class="grid gap-5 @container" data-slot="events-taskings-header">
	<PageShell.Header variant="headline" {eyebrow} title={headline} aside={actions} />
	<div class="flex min-w-0 flex-wrap items-center gap-2">
		<div class="flex items-center gap-2">
			<Button variant="outline" href={base} class="pl-1.5">
				<ChevronLeft data-icon="inline-start" aria-hidden="true" />Calendar
			</Button>
			<PageShell.Tabs variant="segmented" label="Events and taskings" items={tabs} />
		</div>
		{#if detail || strip}
			<div class="mx-1 hidden h-5 w-px shrink-0 bg-border @min-[64rem]:block" aria-hidden="true"></div>
			<div class="flex min-w-0 basis-full items-center gap-2 @min-[64rem]:basis-0 @min-[64rem]:grow">
				{#if detail}
					<Button variant="ghost" href={`${base}/${section}`} class="px-1.5">
						<ChevronLeft data-icon="inline-start" aria-hidden="true" />All {section}
					</Button>
				{/if}
				{@render strip?.()}
			</div>
		{/if}
	</div>
</div>
