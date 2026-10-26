<script lang="ts">
	import type { CalendarEventsPageAccess } from '../../contracts';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import CalendarX from '@lucide/svelte/icons/calendar-x';
	import { invalidate, replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
	import * as PageShell from '$lib/components/patterns/page-shell';
	import * as Alert from '$lib/components/ui/alert';
	import { Button } from '$lib/components/ui/button';
	import * as Empty from '$lib/components/ui/empty';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { formatDisplayDateTime } from '$lib/utils/dates';
	import { StreamedValue } from '$lib/utils/streamedValue.svelte';
	import {
		eventDateRange,
		parseSourceReference,
		type CalendarEvent,
		type EventActivity,
		type EventDetail,
		type EventRead
	} from '../eventModel';
	import { datesChanged, type TaskingSummary } from '../../taskings/eventWorkModel';
	import type { GroupLabels, Tasking, TaskingChoices } from '../../taskings/taskingModel';
	import EventDateReview from '../../taskings/components/EventDateReview.svelte';
	import EventTaskings from '../../taskings/components/EventTaskings.svelte';
	import CancelEventDialog from './CancelEventDialog.svelte';
	import EventDialog from './EventDialog.svelte';
	import EventLoadFailed from './EventLoadFailed.svelte';
	import EventStatusBadge from './EventStatusBadge.svelte';
	import { describeActivity, hostLabel, memberLabel } from './eventLabels';

	interface Props {
		org: CalendarEventsPageAccess;
		today: string;
		detail: Promise<EventRead<EventDetail>>;
		activity: Promise<EventRead<EventActivity[]>>;
		taskings: Promise<EventRead<{ taskings: Tasking[]; groups: GroupLabels }>>;
		taskingSummaries: Promise<EventRead<TaskingSummary[]>>;
		taskingChoices: Promise<EventRead<TaskingChoices | null>>;
		addTasking: boolean;
	}

	let { org, today, detail, activity, taskings, taskingSummaries, taskingChoices, addTasking }: Props = $props();

	const canManage = $derived(
		org.affordanceForFeatureAction(POLICY_ACTION_CATALOG.calendar.manageEvents, { kind: 'organization' }).allowed
	);
	const eventsHref = $derived(`/org/${org.orgUrlSegment}/calendar/events`);
	const streamedDetail = new StreamedValue(() => detail);
	const streamedActivity = new StreamedValue(() => activity);

	// A save answers with the stored event; it stands until the refreshed detail arrives.
	let saved = $state.raw<{ event: CalendarEvent; over: unknown } | null>(null);
	let dialog = $state<'edit' | 'cancel' | null>(null);
	// After a date change the Taskings left to review stand until dismissed, and survive Back from a Tasking's edit.
	const dateReview = $derived(page.state.eventDateReview ?? null);

	const loaded = $derived.by(() => {
		const current = streamedDetail.current;
		if (current.state !== 'ready') return current.state === 'failed' ? ('failed' as const) : null;
		if (current.value.status !== 'loaded') return current.value.status;
		const event = saved?.over === current ? saved.event : current.value.value.event;
		return { event, members: current.value.value.members };
	});
	const activityLoaded = $derived.by(() => {
		const current = streamedActivity.current;
		if (current.state !== 'ready') return current.state === 'failed' ? ('failed' as const) : null;
		return current.value.status === 'loaded' ? current.value.value : ('failed' as const);
	});
	const members = $derived(typeof loaded === 'object' && loaded ? loaded.members : {});

	function stored(event: CalendarEvent) {
		const before = typeof loaded === 'object' && loaded ? loaded.event : null;
		if (before && datesChanged(before, event))
			replaceState('', { ...page.state, eventDateReview: { before, after: event } });
		saved = { event, over: streamedDetail.current };
		dialog = null;
		void invalidate('app:calendar-events');
	}
</script>

{#snippet back()}
	<Button variant="ghost" size="icon-sm" href={eventsHref} aria-label="Back to Events">
		<ArrowLeft />
	</Button>
{/snippet}

<PageShell.Root width="content" density="compact">
	{#if loaded === null}
		<div class="grid gap-6" role="status" aria-label="Loading event">
			<div class="flex items-center gap-2">
				<Skeleton class="size-8" />
				<Skeleton class="h-8 w-2/3 max-w-md" />
			</div>
			<div class="grid gap-3">
				{#each [0, 1, 2, 3, 4, 5] as placeholder (placeholder)}
					<Skeleton class="h-8 w-full" />
				{/each}
			</div>
		</div>
	{:else if loaded === 'gone'}
		<Empty.Root class="rounded-lg border">
			<Empty.Media variant="icon"><CalendarX /></Empty.Media>
			<Empty.Header>
				<Empty.Title>This event is not available</Empty.Title>
				<Empty.Description>It may be in another organization, or the link is wrong.</Empty.Description>
			</Empty.Header>
			<Empty.Content>
				<Button variant="outline" href={eventsHref}>Back to Events</Button>
			</Empty.Content>
		</Empty.Root>
	{:else if loaded === 'failed'}
		<PageShell.Header title="Event" {back} />
		<EventLoadFailed title="This event could not be loaded" />
	{:else}
		{@const { event } = loaded}
		{@const source = event.sourceReference ? parseSourceReference(event.sourceReference) : null}
		<PageShell.Header title={event.title} {back}>
			{#snippet meta()}
				<EventStatusBadge {event} {today} />
			{/snippet}
			{#snippet aside()}
				{#if canManage && !event.cancellation}
					<div class="flex flex-wrap gap-2">
						<Button variant="outline" onclick={() => (dialog = 'edit')}>Edit</Button>
						<Button variant="outline" onclick={() => (dialog = 'cancel')}>Cancel event</Button>
					</div>
				{/if}
			{/snippet}
		</PageShell.Header>

		{#if event.cancellation}
			<Alert.Root>
				<Alert.Title>
					Cancelled {formatDisplayDateTime(event.cancellation.at)} by {memberLabel(event.cancellation.by, members)}
				</Alert.Title>
				{#if event.cancellation.reason}
					<Alert.Description class="whitespace-pre-line">{event.cancellation.reason}</Alert.Description>
				{/if}
			</Alert.Root>
		{/if}

		<dl>
			<PageShell.FactRow label="Dates" value={eventDateRange(event)} />
			<PageShell.FactRow label="Host" value={hostLabel(event.host, org.orgName)} />
			<PageShell.FactRow label="Coordinator" value={memberLabel(event.coordinatorUserId, members)} />
			<PageShell.FactRow label="Location" value={event.location} />
			{#if source?.kind === 'link'}
				<PageShell.FactRow label="Source">
					<a href={source.url} target="_blank" rel="noopener noreferrer" class="break-all underline underline-offset-3"
						>{source.url}</a
					>
				</PageShell.FactRow>
			{:else}
				<PageShell.FactRow label="Source" value={event.sourceReference} />
			{/if}
			{#if event.description}
				<PageShell.FactRow label="Description">
					<p class="m-0 wrap-anywhere whitespace-pre-line">{event.description}</p>
				</PageShell.FactRow>
			{:else}
				<PageShell.FactRow label="Description" value={null} />
			{/if}
		</dl>

		{#if dateReview}
			<EventDateReview
				{org}
				{taskings}
				before={dateReview.before}
				after={dateReview.after}
				onDismiss={() => replaceState('', { ...page.state, eventDateReview: undefined })}
			/>
		{/if}

		<EventTaskings
			{org}
			{today}
			{event}
			{taskings}
			summaries={taskingSummaries}
			choices={taskingChoices}
			addOnArrival={addTasking}
		/>
	{/if}

	{#if loaded !== 'gone'}
		<section class="grid gap-3" aria-labelledby="event-activity-heading">
			<h2 id="event-activity-heading" class="font-heading text-lg font-semibold">Activity</h2>
			{#if activityLoaded === null || loaded === null}
				<div class="grid gap-3" role="status" aria-label="Loading activity">
					{#each [0, 1, 2] as placeholder (placeholder)}
						<div class="grid gap-1">
							<Skeleton class="h-5 w-2/3" />
							<Skeleton class="h-4 w-40" />
						</div>
					{/each}
				</div>
			{:else if activityLoaded === 'failed'}
				<EventLoadFailed title="Activity could not be loaded" />
			{:else}
				<ol class="grid gap-3">
					{#each activityLoaded as entry (entry.id)}
						{@const line = describeActivity(entry, members, org.orgName)}
						<li class="grid gap-0.5 border-l-2 border-border pl-3">
							<p class="m-0 text-sm">{line.summary}</p>
							{#if line.note}
								<p class="m-0 text-sm whitespace-pre-line text-muted-foreground">{line.note}</p>
							{/if}
							<p class="m-0 font-mono text-xs text-muted-foreground">
								{memberLabel(entry.actorUserId, members)} · {formatDisplayDateTime(entry.at)}
							</p>
						</li>
					{/each}
				</ol>
			{/if}
		</section>
	{/if}
</PageShell.Root>

{#if typeof loaded === 'object' && loaded !== null}
	{#if dialog === 'edit'}
		<EventDialog
			orgId={org.orgId}
			event={loaded.event}
			{members}
			currentUserId={org.userId}
			onSaved={stored}
			onClose={() => (dialog = null)}
		/>
	{:else if dialog === 'cancel'}
		<CancelEventDialog {org} event={loaded.event} {taskings} onCancelled={stored} onClose={() => (dialog = null)} />
	{/if}
{/if}
