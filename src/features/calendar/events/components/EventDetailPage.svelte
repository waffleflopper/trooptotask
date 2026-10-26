<script lang="ts">
	import type { CalendarEventsPageAccess } from '../../contracts';
	import CalendarDays from '@lucide/svelte/icons/calendar-days';
	import CalendarX from '@lucide/svelte/icons/calendar-x';
	import Ellipsis from '@lucide/svelte/icons/ellipsis';
	import Plus from '@lucide/svelte/icons/plus';
	import { page } from '$app/state';
	import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
	import * as PageShell from '$lib/components/patterns/page-shell';
	import * as Alert from '$lib/components/ui/alert';
	import { Button } from '$lib/components/ui/button';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import * as Empty from '$lib/components/ui/empty';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { formatDate, formatDayMonth, formatDisplayDateTime } from '$lib/utils/dates';
	import { StreamedValue } from '$lib/utils/streamedValue.svelte';
	import { calendarStore } from '../../stores/calendar.svelte';
	import {
		eventCountdown,
		eventDayRange,
		parseSourceReference,
		type CalendarEvent,
		type EventActivity,
		type EventDetail,
		type EventRead
	} from '../eventModel';
	import { datesChanged, type TaskingSummary } from '../../taskings/eventWorkModel';
	import type { EventTaskingList, TaskingChoices } from '../../taskings/taskingModel';
	import type { TaskingWorkspace } from '../../taskings/taskingReadModel';
	import EventDateReview from '../../taskings/components/EventDateReview.svelte';
	import EventTaskings from '../../taskings/components/EventTaskings.svelte';
	import EventsTaskingsHeader from '../../taskings/components/EventsTaskingsHeader.svelte';
	import { reloadCalendarEvents, setEventPageState } from '../eventPageState';
	import CancelEventDialog from './CancelEventDialog.svelte';
	import EventDialog from './EventDialog.svelte';
	import EventLoadFailed from './EventLoadFailed.svelte';
	import { describeActivity, memberLabel } from './eventLabels';

	interface Props {
		org: CalendarEventsPageAccess;
		today: string;
		detail: Promise<EventRead<EventDetail>>;
		activity: Promise<EventRead<EventActivity[]>>;
		taskings: Promise<EventRead<EventTaskingList>>;
		taskingSummaries: Promise<EventRead<TaskingSummary[]>>;
		/** This Event's Tasking totals and each visible Tasking's staffing, equipment and conflict facts. */
		workspace: Promise<EventRead<TaskingWorkspace>>;
		taskingChoices: Promise<EventRead<TaskingChoices | null>>;
		addTasking: boolean;
	}

	let { org, today, detail, activity, taskings, taskingSummaries, workspace, taskingChoices, addTasking }: Props =
		$props();

	const canManage = $derived(
		org.affordanceForFeatureAction(POLICY_ACTION_CATALOG.calendar.manageEvents, { kind: 'organization' }).allowed
	);
	const canAddTasking = $derived(
		org.affordanceForFeatureAction(POLICY_ACTION_CATALOG.calendar.manageTaskings, { kind: 'unscoped' }).allowed
	);
	const eventsHref = $derived(`/org/${org.orgUrlSegment}/calendar/events`);
	const streamedDetail = new StreamedValue(() => detail);
	const streamedActivity = new StreamedValue(() => activity);
	let eventTaskings = $state<ReturnType<typeof EventTaskings>>();

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
	const event = $derived(typeof loaded === 'object' && loaded ? loaded.event : null);
	const open = $derived(event !== null && !event.cancellation);
	const title = $derived(event ? event.title : loaded === null ? null : 'Event');

	let latestSave = 0;

	async function stored(next: CalendarEvent) {
		const save = ++latestSave;
		const before = event;
		const eventUrl = page.url.pathname;
		saved = { event: next, over: streamedDetail.current };
		dialog = null;
		await reloadCalendarEvents();
		// The reader may have moved on while the refresh ran.
		if (before && datesChanged(before, next) && save === latestSave && page.url.pathname === eventUrl)
			setEventPageState({
				...page.state,
				eventDateReview: {
					before: { startsOn: before.startsOn, endsOn: before.endsOn },
					after: { startsOn: next.startsOn, endsOn: next.endsOn }
				}
			});
	}

	/** The Calendar opens on the month it was last left in, so the link moves it to the Event's month first. */
	function showOnAvailability(startsOn: string) {
		calendarStore.goToMonth(Number(startsOn.slice(0, 4)), Number(startsOn.slice(5, 7)) - 1);
	}

	const historyDay = (at: string) => formatDayMonth(formatDate(new Date(at)));
	const hostedBy = (current: CalendarEvent) =>
		current.host.kind === 'organization' ? `${org.orgName} (this organization)` : `${current.host.name} · tracked here`;
</script>

{#snippet actions()}
	{#if open && (canManage || canAddTasking)}
		<div class="flex flex-wrap items-center gap-2">
			{#if canManage}
				<Button variant="outline" onclick={() => (dialog = 'edit')}>Edit event</Button>
			{/if}
			{#if canAddTasking}
				<Button onclick={() => eventTaskings?.startCreate()}>
					<Plus data-icon="inline-start" aria-hidden="true" />Add tasking
				</Button>
			{/if}
		</div>
	{/if}
{/snippet}

{#snippet strip()}
	{#if event}
		{@const startsOn = event.startsOn}
		<div class="grow"></div>
		<Button
			variant="link"
			class="px-2.5 underline"
			href={`/org/${org.orgUrlSegment}/calendar`}
			onclick={() => showOnAvailability(startsOn)}
		>
			<CalendarDays data-icon="inline-start" aria-hidden="true" />Show on availability
		</Button>
		{#if canManage && open}
			<DropdownMenu.Root>
				<DropdownMenu.Trigger>
					{#snippet child({ props })}
						<Button {...props} variant="outline" size="icon" aria-label="More event actions">
							<Ellipsis />
						</Button>
					{/snippet}
				</DropdownMenu.Trigger>
				<DropdownMenu.Content align="end">
					<DropdownMenu.Item variant="destructive" onSelect={() => (dialog = 'cancel')}>Cancel event</DropdownMenu.Item>
				</DropdownMenu.Content>
			</DropdownMenu.Root>
		{/if}
	{/if}
{/snippet}

{#snippet label(text: string)}
	<span
		class="block font-mono text-[11px] leading-[14px] font-medium tracking-[0.08em] text-muted-foreground uppercase"
	>
		{text}
	</span>
{/snippet}

<PageShell.Root width="wide">
	<EventsTaskingsHeader orgUrlSegment={org.orgUrlSegment} section="events" detail {title} {actions} {strip} />

	{#if loaded === null}
		<div class="@container" role="status" aria-label="Loading event">
			<div class="grid items-start gap-8 @min-[52rem]:grid-cols-[320px_minmax(0,1fr)]">
				<div class="grid gap-[18px] rounded-lg border border-border bg-card p-5">
					<div class="grid gap-1.5">
						<Skeleton class="h-3.5 w-28" />
						<Skeleton class="h-7 w-52" />
						<Skeleton class="h-5 w-40" />
					</div>
					{#each [0, 1, 2] as placeholder (placeholder)}
						<div class="grid gap-1">
							<Skeleton class="h-3.5 w-20" />
							<Skeleton class="h-5 w-44" />
						</div>
					{/each}
				</div>
				<div class="grid gap-4">
					<Skeleton class="h-[26px] w-56" />
					<Skeleton class="h-48 w-full rounded-lg" />
				</div>
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
		<EventLoadFailed title="This event could not be loaded" />
	{:else}
		{@const current = loaded.event}
		{@const source = current.sourceReference ? parseSourceReference(current.sourceReference) : null}
		{@const countdown = eventCountdown(current, today)}

		{#if current.cancellation}
			<Alert.Root>
				<Alert.Title>
					Cancelled {formatDisplayDateTime(current.cancellation.at)} by {memberLabel(current.cancellation.by, members)}
				</Alert.Title>
				{#if current.cancellation.reason}
					<Alert.Description class="whitespace-pre-line">{current.cancellation.reason}</Alert.Description>
				{/if}
			</Alert.Root>
		{/if}

		{#if dateReview}
			<EventDateReview
				{org}
				{taskings}
				before={dateReview.before}
				after={dateReview.after}
				onDismiss={() => setEventPageState({ ...page.state, eventDateReview: undefined })}
			/>
		{/if}

		<div class="@container">
			<div class="grid items-start gap-8 @min-[52rem]:grid-cols-[320px_minmax(0,1fr)]">
				<article class="grid min-w-0 gap-[18px] rounded-lg border border-border bg-card p-5" aria-label="Event">
					<div class="grid gap-1.5">
						<span
							class={[
								'font-mono text-[11px] leading-[14px] font-medium tracking-[0.08em] uppercase',
								countdown.upcoming ? 'text-accent-text' : 'text-muted-foreground'
							]}
						>
							{countdown.text}
						</span>
						<p
							class={[
								'm-0 font-heading text-[26px] leading-7 font-bold text-foreground',
								current.cancellation && 'line-through'
							]}
						>
							{eventDayRange(current, today)}
						</p>
						{#if current.location}
							<p class="m-0 text-sm wrap-anywhere text-foreground/80">{current.location}</p>
						{/if}
					</div>
					<div class="h-px bg-border"></div>
					<dl class="m-0 grid gap-3">
						<div class="grid gap-0.5">
							<dt>{@render label('Hosted by')}</dt>
							<dd class="m-0 text-sm wrap-anywhere text-foreground">{hostedBy(current)}</dd>
						</div>
						{#if current.sourceReference}
							<div class="grid gap-0.5">
								<dt>{@render label('Source')}</dt>
								<dd class="m-0 text-sm wrap-anywhere text-foreground">
									{#if source?.kind === 'link'}
										<a
											href={source.url}
											target="_blank"
											rel="noopener noreferrer"
											class="break-all underline underline-offset-3">{source.url}</a
										>
									{:else}
										{current.sourceReference}
									{/if}
								</dd>
							</div>
						{/if}
						<div class="grid gap-0.5">
							<dt>{@render label('Coordinator')}</dt>
							<dd class="m-0 text-sm text-foreground">{memberLabel(current.coordinatorUserId, members)}</dd>
						</div>
					</dl>
					{#if current.description}
						<div class="h-px bg-border"></div>
						<p class="m-0 text-sm leading-[21px] wrap-anywhere whitespace-pre-line text-foreground/80">
							{current.description}
						</p>
					{/if}
					<section class="grid gap-2 border-t border-border pt-3.5" aria-labelledby="event-history-heading">
						<h2 id="event-history-heading" class="m-0">{@render label('History')}</h2>
						{#if activityLoaded === null}
							<div class="grid gap-2" role="status" aria-label="Loading history">
								{#each [0, 1] as placeholder (placeholder)}
									<Skeleton class="h-[18px] w-full" />
								{/each}
							</div>
						{:else if activityLoaded === 'failed'}
							<EventLoadFailed title="History could not be loaded" />
						{:else}
							<ol class="m-0 grid gap-2">
								{#each [...activityLoaded].reverse() as entry (entry.id)}
									{@const line = describeActivity(entry, members, org.orgName)}
									<li class="flex gap-2.5">
										<span class="w-[52px] shrink-0 font-mono text-xs leading-[18px] text-muted-foreground">
											{historyDay(entry.at)}
										</span>
										<span class="grid min-w-0 gap-0.5 text-[13px] leading-[18px] text-foreground/80">
											<span class="wrap-anywhere">
												{line.summary}
												<span class="text-muted-foreground">· {memberLabel(entry.actorUserId, members)}</span>
											</span>
											{#if line.note}
												<span class="wrap-anywhere whitespace-pre-line text-muted-foreground">{line.note}</span>
											{/if}
										</span>
									</li>
								{/each}
							</ol>
						{/if}
					</section>
				</article>

				<EventTaskings
					bind:this={eventTaskings}
					{org}
					{today}
					event={current}
					{taskings}
					summaries={taskingSummaries}
					{workspace}
					choices={taskingChoices}
					addOnArrival={addTasking}
				/>
			</div>
		</div>
	{/if}
</PageShell.Root>

{#if event}
	{#if dialog === 'edit'}
		<EventDialog
			orgId={org.orgId}
			orgName={org.orgName}
			{event}
			{members}
			currentUserId={org.userId}
			onSaved={stored}
			onClose={() => (dialog = null)}
		/>
	{:else if dialog === 'cancel'}
		<CancelEventDialog {org} {event} {taskings} onCancelled={stored} onClose={() => (dialog = null)} />
	{/if}
{/if}
