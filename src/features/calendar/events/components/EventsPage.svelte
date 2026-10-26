<script lang="ts">
	import type { CalendarEventsPageAccess } from '../../contracts';
	import CalendarPlus from '@lucide/svelte/icons/calendar-plus';
	import { goto } from '$app/navigation';
	import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
	import * as PageShell from '$lib/components/patterns/page-shell';
	import { WorkspaceToolbar, type ToolbarItem } from '$lib/components/patterns/workspace-toolbar';
	import { Button } from '$lib/components/ui/button';
	import * as Empty from '$lib/components/ui/empty';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { StreamedValue } from '$lib/utils/streamedValue.svelte';
	import {
		PAST_EVENT_LIMIT,
		eventDateRange,
		type CalendarEvent,
		type EventList,
		type EventListWhen,
		type EventRead,
		type MemberLabels
	} from '../eventModel';
	import EventDialog from './EventDialog.svelte';
	import EventLoadFailed from './EventLoadFailed.svelte';
	import EventStatusBadge from './EventStatusBadge.svelte';
	import { hostLabel, memberLabel } from './eventLabels';

	interface Props {
		org: CalendarEventsPageAccess;
		today: string;
		when: EventListWhen;
		list: Promise<EventRead<EventList>>;
	}

	let { org, today, when, list }: Props = $props();

	const canManage = $derived(
		org.affordanceForFeatureAction(POLICY_ACTION_CATALOG.calendar.manageEvents, { kind: 'organization' }).allowed
	);
	const eventsHref = $derived(`/org/${org.orgUrlSegment}/calendar/events`);
	const streamed = new StreamedValue(() => list);
	// A refresh keeps the shown list; switching between upcoming and past shows the skeleton until the other list arrives.
	const shown = $derived.by(() => {
		const current = streamed.current;
		if (current.state === 'pending' || current.state === 'absent') return null;
		if (current.state === 'failed' || current.value.status !== 'loaded') return 'failed' as const;
		return current.value.value.when === when ? current.value.value : null;
	});
	let creating = $state<{ members: MemberLabels } | null>(null);

	const VIEWS: { value: EventListWhen; label: string }[] = [
		{ value: 'upcoming', label: 'Upcoming' },
		{ value: 'past', label: 'Past' }
	];

	const toolbarItems = $derived<ToolbarItem[]>([
		{
			kind: 'view',
			id: 'when',
			label: 'Show',
			options: VIEWS,
			value: when,
			onValueChange: (value) =>
				void goto(value === 'past' ? `${eventsHref}?when=past` : eventsHref, { keepFocus: true, noScroll: true })
		},
		{
			kind: 'action',
			id: 'calendar',
			label: 'Calendar',
			icon: 'arrow-left',
			href: `/org/${org.orgUrlSegment}/calendar`
		}
	]);

	/** The coordinator picker needs the member list, which arrives with the events. */
	async function startCreate() {
		const requested = list;
		const result = await requested;
		if (requested === list && result.status === 'loaded') creating = { members: result.value.members };
	}

	function created(event: CalendarEvent) {
		creating = null;
		void goto(`${eventsHref}/${event.id}`);
	}
</script>

<PageShell.Root width="content" density="compact">
	<PageShell.Header title="Events" subtitle="What the unit runs, supports or needs to know about, by date." />
	<WorkspaceToolbar
		ariaLabel="Event controls"
		items={toolbarItems}
		primary={canManage
			? { kind: 'action', id: 'create', label: 'Create event', icon: 'plus', onclick: startCreate }
			: undefined}
	/>

	{#if shown === null}
		<div class="grid gap-2" role="status" aria-label="Loading events">
			{#each [0, 1, 2, 3] as placeholder (placeholder)}
				<div class="grid gap-1 rounded-lg border p-3 sm:grid-cols-[11rem_minmax(0,1fr)_auto] sm:items-center sm:gap-3">
					<Skeleton class="h-5 w-32" />
					<div class="grid gap-0.5">
						<Skeleton class="h-6 w-2/3" />
						<Skeleton class="h-5 w-1/2" />
					</div>
					<Skeleton class="h-5 w-16" />
				</div>
			{/each}
		</div>
	{:else if shown === 'failed'}
		<EventLoadFailed title="Events could not be loaded" />
	{:else if shown.events.length === 0}
		<Empty.Root class="rounded-lg border">
			<Empty.Media variant="icon"><CalendarPlus /></Empty.Media>
			<Empty.Header>
				<Empty.Title>{when === 'past' ? 'No past events' : 'No upcoming events'}</Empty.Title>
				<Empty.Description>
					{when === 'past'
						? 'Events appear here once their last day has passed.'
						: 'Events the unit runs, supports or should know about appear here.'}
				</Empty.Description>
			</Empty.Header>
			{#if canManage && when === 'upcoming'}
				<Empty.Content>
					<Button onclick={startCreate}>Create event</Button>
				</Empty.Content>
			{/if}
		</Empty.Root>
	{:else}
		<ul class="grid gap-2">
			{#each shown.events as event (event.id)}
				<li>
					<a
						href={`${eventsHref}/${event.id}`}
						class="grid gap-1 rounded-lg border p-3 transition-colors hover:bg-muted/60 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none sm:grid-cols-[11rem_minmax(0,1fr)_auto] sm:items-center sm:gap-3"
					>
						<span class="font-mono text-sm text-muted-foreground tabular-nums">{eventDateRange(event)}</span>
						<span class="grid min-w-0 gap-0.5">
							<span class={['truncate font-medium', event.cancellation && 'text-muted-foreground line-through']}>
								{event.title}
							</span>
							<span class="truncate text-sm text-muted-foreground">
								{hostLabel(event.host, org.orgName)} · {memberLabel(event.coordinatorUserId, shown.members)}
							</span>
						</span>
						<EventStatusBadge {event} {today} />
					</a>
				</li>
			{/each}
		</ul>
		{#if when === 'past' && shown.events.length >= PAST_EVENT_LIMIT}
			<p class="text-sm text-muted-foreground">Showing the {PAST_EVENT_LIMIT} most recent past events.</p>
		{/if}
	{/if}
</PageShell.Root>

{#if creating}
	<EventDialog
		orgId={org.orgId}
		members={creating.members}
		currentUserId={org.userId}
		onSaved={created}
		onClose={() => (creating = null)}
	/>
{/if}
