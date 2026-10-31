<script lang="ts">
	import type { CalendarEventsPageAccess } from '../../contracts';
	import CalendarPlus from '@lucide/svelte/icons/calendar-plus';
	import Plus from '@lucide/svelte/icons/plus';
	import { goto } from '$app/navigation';
	import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
	import * as PageShell from '$lib/components/patterns/page-shell';
	import { WorkspaceToolbar, type ToolbarItem } from '$lib/components/patterns/workspace-toolbar';
	import * as Alert from '$lib/components/ui/alert';
	import { Button } from '$lib/components/ui/button';
	import * as Empty from '$lib/components/ui/empty';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { StreamedValue } from '$lib/utils/streamedValue.svelte';
	import {
		PAST_EVENT_LIMIT,
		shortEventDateRange,
		type CalendarEvent,
		type EventHost,
		type EventList,
		type EventListWhen,
		type EventRead,
		type MemberLabels
	} from '../eventModel';
	import type { Tasking, TaskingChoices } from '../../taskings/taskingModel';
	import type { TaskingWorkspace } from '../../taskings/taskingReadModel';
	import { rollupFact } from '../../taskings/taskingRowModel';
	import ConflictMarker from '../../taskings/components/ConflictMarker.svelte';
	import EventsTaskingsHeader from '../../taskings/components/EventsTaskingsHeader.svelte';
	import TaskingDialog from '../../taskings/components/TaskingDialog.svelte';
	import { TONE_TEXT } from '../../taskings/components/taskingLabels';
	import EventDialog from './EventDialog.svelte';
	import EventLoadFailed from './EventLoadFailed.svelte';

	interface Props {
		org: CalendarEventsPageAccess;
		today: string;
		when: EventListWhen;
		list: Promise<EventRead<EventList>>;
		/** Per-Event Tasking totals, need-action and conflict counts. */
		workspace: Promise<EventRead<TaskingWorkspace>>;
		choices: Promise<EventRead<TaskingChoices | null>>;
	}

	let { org, today, when, list, workspace, choices }: Props = $props();

	const canManage = $derived(
		org.affordanceForFeatureAction(POLICY_ACTION_CATALOG.calendar.manageEvents, { kind: 'organization' }).allowed
	);
	const canCreateTasking = $derived(
		org.affordanceForFeatureAction(POLICY_ACTION_CATALOG.calendar.manageTaskings, { kind: 'unscoped' }).allowed
	);
	const organizationWide = $derived(
		org.affordanceForFeatureAction(POLICY_ACTION_CATALOG.calendar.manageTaskings, { kind: 'organization' }).allowed
	);
	const eventsHref = $derived(`/org/${org.orgUrlSegment}/calendar/events`);
	const streamed = new StreamedValue(() => list);
	const streamedWorkspace = new StreamedValue(() => workspace);
	// A refresh keeps the shown list; switching between upcoming and past shows the skeleton until the other list arrives.
	const shown = $derived.by(() => {
		const current = streamed.current;
		if (current.state === 'pending' || current.state === 'absent') return null;
		if (current.state === 'failed' || current.value.status !== 'loaded') return 'failed' as const;
		return current.value.value.when === when ? current.value.value : null;
	});
	const rollups = $derived.by(() => {
		const current = streamedWorkspace.current;
		if (current.state === 'pending' || current.state === 'absent') return null;
		if (current.state === 'failed' || current.value.status !== 'loaded') return 'failed' as const;
		return current.value.value.events;
	});
	let creating = $state<{ members: MemberLabels } | null>(null);
	let creatingTasking = $state<TaskingChoices | null>(null);
	let createError = $state('');

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
			onValueChange: (value) => void goto(value === 'past' ? `${eventsHref}?when=past` : eventsHref, { reset: false })
		}
	]);

	const hostText = (host: EventHost) =>
		host.kind === 'organization' ? `${org.orgName} (this organization)` : host.name;

	/** The coordinator picker needs the member list, which arrives with the events. */
	async function startCreate() {
		createError = '';
		const requested = list;
		const result = await requested;
		if (requested !== list) return;
		if (result.status === 'loaded') creating = { members: result.value.members };
		else createError = 'The members to choose a coordinator from could not be loaded. Try again in a moment.';
	}

	async function startCreateTasking() {
		createError = '';
		const requested = choices;
		const result = await requested;
		if (requested !== choices) return;
		if (result.status === 'loaded' && result.value) creatingTasking = result.value;
		else createError = 'The groups and events to choose from could not be loaded. Try again in a moment.';
	}

	function created(event: CalendarEvent, next?: 'add-tasking') {
		creating = null;
		void goto(`${eventsHref}/${event.id}${next === 'add-tasking' ? '?addTasking=1' : ''}`);
	}

	function createdTasking(tasking: Tasking) {
		creatingTasking = null;
		void goto(`/org/${org.orgUrlSegment}/calendar/taskings/${tasking.id}`);
	}
</script>

{#snippet actions()}
	{#if canManage || canCreateTasking}
		<div class="flex flex-wrap items-center gap-2">
			{#if canManage}
				<Button variant="outline" onclick={startCreate}>Create event</Button>
			{/if}
			{#if canCreateTasking}
				<Button onclick={startCreateTasking}><Plus data-icon="inline-start" aria-hidden="true" />Create tasking</Button>
			{/if}
		</div>
	{/if}
{/snippet}

{#snippet strip()}
	<div class="min-w-0 grow">
		<WorkspaceToolbar ariaLabel="Event controls" bare items={toolbarItems} />
	</div>
{/snippet}

<PageShell.Root width="wide">
	<EventsTaskingsHeader
		orgUrlSegment={org.orgUrlSegment}
		section="events"
		title="Events & Taskings"
		{today}
		{actions}
		{strip}
	/>

	{#if createError}
		<Alert.Root variant="destructive">
			<Alert.Description>{createError}</Alert.Description>
		</Alert.Root>
	{/if}

	{#if shown === null}
		<div class="overflow-hidden rounded-lg border border-border" role="status" aria-label="Loading events">
			<div class="h-9 border-b border-border bg-muted"></div>
			{#each [0, 1, 2, 3] as placeholder (placeholder)}
				<div class="flex h-[52px] items-center gap-3 border-b border-border px-3.5 last:border-b-0">
					<Skeleton class="h-4 w-28 shrink-0" />
					<Skeleton class="h-4 min-w-0 grow" />
					<Skeleton class="hidden h-4 w-32 shrink-0 sm:block" />
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
		<div class="grid gap-2">
			{#if rollups === 'failed'}
				<p class="text-sm text-danger-foreground" role="status">
					Tasking counts could not be loaded. The events are still listed.
				</p>
			{/if}
			<!-- One row markup for both layouts: below the container breakpoint the dates sit over the title and the host and taskings share a line. -->
			<div class="@container">
				<div class="overflow-hidden rounded-lg border border-border bg-card">
					<div
						class="hidden h-9 items-center gap-3 border-b border-border bg-muted px-3.5 font-mono text-[11px] leading-[14px] font-medium tracking-[0.08em] text-muted-foreground uppercase @min-[48rem]:grid @min-[48rem]:grid-cols-[180px_minmax(0,1fr)_200px_200px]"
						aria-hidden="true"
					>
						<span>Dates</span>
						<span>Event</span>
						<span>Host</span>
						<span>Taskings</span>
					</div>
					<ul>
						{#each shown.events as event (event.id)}
							{@const summary = rollups && rollups !== 'failed' ? rollups[event.id] : undefined}
							{@const rollup = rollups && rollups !== 'failed' ? rollupFact(summary) : null}
							<li class="border-b border-border last:border-b-0">
								<a
									href={`${eventsHref}/${event.id}`}
									class="grid gap-x-3 gap-y-1 px-3.5 py-3 transition-colors hover:bg-muted/60 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none focus-visible:ring-inset @min-[48rem]:h-[52px] @min-[48rem]:grid-cols-[180px_minmax(0,1fr)_200px_200px] @min-[48rem]:items-center @min-[48rem]:py-0"
								>
									<span class="font-mono text-[13px] text-foreground tabular-nums">
										{shortEventDateRange(event, today)}
									</span>
									<span
										class={[
											'truncate text-sm font-semibold',
											event.cancellation ? 'text-muted-foreground line-through' : 'text-foreground'
										]}
									>
										{event.title}
										{#if event.cancellation}<span class="sr-only">(cancelled)</span>{/if}
									</span>
									<span class="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 @min-[48rem]:contents">
										<span class="truncate text-sm text-foreground">{hostText(event.host)}</span>
										<span class="flex min-w-0 items-center gap-1.5 font-mono text-[13px]">
											<span class="text-muted-foreground @min-[48rem]:sr-only">Taskings</span>
											{#if rollups === null}
												<Skeleton class="h-4 w-24" />
											{:else if rollup}
												<span class={['truncate', TONE_TEXT[rollup.tone], rollup.tone === 'danger' && 'font-medium']}>
													{rollup.text}
												</span>
												{#if summary && summary.conflicts > 0}
													<ConflictMarker people={summary.conflicts} />
												{/if}
											{:else}
												<span class="text-muted-foreground">—</span>
											{/if}
										</span>
									</span>
								</a>
							</li>
						{/each}
					</ul>
				</div>
			</div>
			{#if when === 'past' && shown.events.length >= PAST_EVENT_LIMIT}
				<p class="text-sm text-muted-foreground">Showing the {PAST_EVENT_LIMIT} most recent past events.</p>
			{/if}
		</div>
	{/if}
</PageShell.Root>

{#if creating}
	<EventDialog
		orgId={org.orgId}
		orgName={org.orgName}
		members={creating.members}
		currentUserId={org.userId}
		offerTasking={canCreateTasking}
		onSaved={created}
		onClose={() => (creating = null)}
	/>
{/if}

{#if creatingTasking}
	<TaskingDialog
		orgId={org.orgId}
		orgName={org.orgName}
		choices={creatingTasking}
		{organizationWide}
		onSaved={createdTasking}
		onClose={() => (creatingTasking = null)}
	/>
{/if}
