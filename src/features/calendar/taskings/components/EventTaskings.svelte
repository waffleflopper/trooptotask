<script lang="ts">
	import type { CalendarEventsPageAccess } from '../../contracts';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
	import * as Alert from '$lib/components/ui/alert';
	import { Badge } from '$lib/components/ui/badge';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { StreamedValue } from '$lib/utils/streamedValue.svelte';
	import { eventDayRange, type CalendarEvent, type EventRead } from '../../events/eventModel';
	import EventLoadFailed from '../../events/components/EventLoadFailed.svelte';
	import { reloadCalendarEvents } from '../../events/eventPageState';
	import { groupEventWork, type EventWorkPhase, type TaskingSummary } from '../eventWorkModel';
	import { isActiveStatus, type EventTaskingList, type Tasking, type TaskingChoices } from '../taskingModel';
	import { eventRowFacts, itemTimeline, nextDateFacts, summarizeEventWork, type FactTone } from '../taskingRowModel';
	import ResponsibilityPill from './ResponsibilityPill.svelte';
	import TaskingDialog from './TaskingDialog.svelte';
	import { STATUS_BADGES, TONE_TEXT } from './taskingLabels';

	interface Props {
		org: CalendarEventsPageAccess;
		today: string;
		event: CalendarEvent;
		taskings: Promise<EventRead<EventTaskingList>>;
		/** The Taskings outside the reader's scope, as one-line rows. */
		summaries: Promise<EventRead<TaskingSummary[]>>;
		choices: Promise<EventRead<TaskingChoices | null>>;
		/** Opens Create tasking once, for "Create and add tasking". */
		addOnArrival: boolean;
	}

	let { org, today, event, taskings, summaries, choices, addOnArrival }: Props = $props();

	const canCreate = $derived(
		org.affordanceForFeatureAction(POLICY_ACTION_CATALOG.calendar.manageTaskings, { kind: 'unscoped' }).allowed
	);
	const organizationWide = $derived(
		org.affordanceForFeatureAction(POLICY_ACTION_CATALOG.calendar.manageTaskings, { kind: 'organization' }).allowed
	);
	const taskingsHref = $derived(`/org/${org.orgUrlSegment}/calendar/taskings`);
	const streamed = new StreamedValue(() => taskings);
	const streamedSummaries = new StreamedValue(() => summaries);
	// A created Tasking shows at once and stands until the refreshed list arrives.
	let added = $state.raw<{ tasking: Tasking; over: unknown } | null>(null);
	let creating = $state<TaskingChoices | null>(null);
	let createError = $state('');
	let alive = true;
	let arrivalHandled = false;

	$effect(() => () => (alive = false));

	const loaded = $derived.by(() => {
		const current = streamed.current;
		if (current.state !== 'ready') return current.state === 'failed' ? ('failed' as const) : null;
		if (current.value.status !== 'loaded') return 'failed' as const;
		const list = current.value.value;
		if (added?.over !== current || list.taskings.some((tasking) => tasking.id === added?.tasking.id)) return list;
		return { ...list, taskings: [...list.taskings, added.tasking] };
	});

	// The other contributions settle with the rest, so the groups do not reshuffle when they arrive.
	const otherWork = $derived.by(() => {
		const current = streamedSummaries.current;
		if (current.state !== 'ready') return current.state === 'failed' ? ('failed' as const) : null;
		return current.value.status === 'loaded' ? current.value.value : ('failed' as const);
	});
	const work = $derived(
		loaded && loaded !== 'failed' && otherWork !== null
			? groupEventWork(event, loaded.taskings, otherWork === 'failed' ? [] : otherWork)
			: null
	);
	const summary = $derived(
		work && loaded && loaded !== 'failed'
			? summarizeEventWork(
					work.flatMap((group) => group.items),
					loaded.staffing,
					today
				)
			: null
	);
	const hasActiveWork = $derived(
		(work ?? []).some((group) => group.items.some((item) => isActiveStatus(itemTimeline(item).status.kind)))
	);

	const phaseTitle = (phase: EventWorkPhase) =>
		phase === 'preparation'
			? 'Before · prep'
			: phase === 'closeout'
				? 'After · closeout'
				: `During · ${eventDayRange(event, today)}`;

	const summaryLine = $derived<{ text: string; tone: FactTone }[]>(
		summary
			? [
					{ count: summary.overdue, text: `${summary.overdue} overdue`, tone: 'danger' as const },
					{ count: summary.blocked, text: `${summary.blocked} blocked`, tone: 'danger' as const },
					{
						count: summary.needPeople,
						text: `${summary.needPeople} ${summary.needPeople === 1 ? 'needs' : 'need'} people`,
						tone: 'warning' as const
					},
					{ count: summary.ready, text: `${summary.ready} fully staffed and ready`, tone: 'success' as const }
				].filter((part) => part.count > 0)
			: []
	);

	$effect(() => {
		if (!addOnArrival || arrivalHandled || !canCreate || event.cancellation) return;
		arrivalHandled = true;
		void startCreate();
	});

	/** Add tasking lives in the page header; the page calls this. */
	export async function startCreate() {
		createError = '';
		const requested = choices;
		const result = await requested;
		if (!alive || requested !== choices) return;
		if (result.status === 'loaded' && result.value) creating = result.value;
		else createError = 'The groups and events to choose from could not be loaded. Try again in a moment.';
	}

	function created(tasking: Tasking) {
		if (tasking.event?.id === event.id) added = { tasking, over: streamed.current };
		creating = null;
		void reloadCalendarEvents();
	}
</script>

<section class="grid min-w-0 gap-4" aria-labelledby="event-taskings-heading">
	<div class="grid gap-1.5">
		<div class="flex flex-wrap items-baseline gap-x-2.5">
			<h2 id="event-taskings-heading" class="font-heading text-[22px] leading-[26px] font-semibold">
				What {org.orgName} owes
			</h2>
			{#if summary}
				<span class="font-mono text-xs text-muted-foreground">
					{summary.total}
					{summary.total === 1 ? 'tasking' : 'taskings'}
				</span>
			{/if}
		</div>
		{#if summary === null && loaded !== 'failed'}
			<Skeleton class="h-4 w-64 max-w-full" />
		{:else if summaryLine.length > 0}
			<p class="m-0 flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs font-medium">
				{#each summaryLine as part (part.text)}
					<span class={TONE_TEXT[part.tone]}>{part.text}</span>
				{/each}
			</p>
		{/if}
	</div>

	{#if createError}
		<Alert.Root variant="destructive">
			<Alert.Description>{createError}</Alert.Description>
		</Alert.Root>
	{/if}

	{#if loaded === null || otherWork === null}
		<div class="overflow-hidden rounded-lg border border-border" role="status" aria-label="Loading taskings">
			<div class="h-[30px] border-b border-border bg-muted"></div>
			{#each [0, 1, 2] as placeholder (placeholder)}
				<div class="flex h-14 items-center gap-3 border-b border-border px-3.5 last:border-b-0">
					<Skeleton class="h-5 w-20 shrink-0" />
					<div class="grid min-w-0 grow gap-1">
						<Skeleton class="h-4 w-2/3" />
						<Skeleton class="h-3 w-1/3" />
					</div>
					<Skeleton class="hidden h-4 w-24 shrink-0 sm:block" />
				</div>
			{/each}
		</div>
	{:else if loaded === 'failed'}
		<EventLoadFailed title="Taskings could not be loaded" />
	{:else}
		{#if event.cancellation && hasActiveWork}
			<Alert.Root>
				<Alert.Description>
					This event was cancelled. Its active taskings stay open until someone completes or cancels them.
				</Alert.Description>
			</Alert.Root>
		{/if}
		{#if work && work.length > 0}
			<!-- One row markup for both layouts: below the container breakpoint the status sits beside the title and the dates drop under it. -->
			<div class="@container">
				<div class="overflow-hidden rounded-lg border border-border bg-card">
					{#each work as group (group.phase)}
						<section class="border-b border-border last:border-b-0" aria-labelledby={`event-work-${group.phase}`}>
							<h3
								id={`event-work-${group.phase}`}
								class="m-0 flex h-[30px] items-center border-b border-border bg-muted px-3.5 font-mono text-[11px] leading-[14px] font-medium tracking-[0.08em] text-muted-foreground uppercase"
							>
								{phaseTitle(group.phase)}
							</h3>
							<ul>
								{#each group.items as item (item.kind === 'full' ? item.tasking.id : item.summary.id)}
									{@const timeline = itemTimeline(item)}
									{@const status = STATUS_BADGES[timeline.status.kind]}
									{@const fact = eventRowFacts(item, loaded.staffing)}
									{@const next = nextDateFacts(timeline, today, { report: true })}
									<li class="border-b border-border last:border-b-0">
										<svelte:element
											this={item.kind === 'full' ? 'a' : 'div'}
											href={item.kind === 'full' ? `${taskingsHref}/${item.tasking.id}` : undefined}
											class={[
												'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 px-3.5 py-3 @min-[40rem]:h-14 @min-[40rem]:grid-cols-[96px_minmax(0,1fr)_130px_16px] @min-[40rem]:py-0',
												item.kind === 'full' &&
													'transition-colors hover:bg-muted/60 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none focus-visible:ring-inset'
											]}
										>
											<span
												class="col-start-2 row-start-1 flex justify-self-end @min-[40rem]:col-start-auto @min-[40rem]:row-start-auto @min-[40rem]:justify-self-start"
											>
												<Badge variant={status.variant}>{status.label}</Badge>
											</span>
											<span
												class="col-start-1 row-start-1 grid min-w-0 gap-[3px] @min-[40rem]:col-start-auto @min-[40rem]:row-start-auto"
											>
												<span class="truncate text-sm leading-[18px] font-semibold text-foreground">
													{item.kind === 'full' ? item.tasking.title : item.summary.title}
												</span>
												<span class="flex min-w-0 items-center gap-2">
													<ResponsibilityPill
														responsibility={item.kind === 'full'
															? item.tasking.responsibility
															: item.summary.responsibility}
														groups={loaded.groups}
														size="sm"
													/>
													{#if fact}
														<span class={['truncate font-mono text-xs', TONE_TEXT[fact.tone]]}>{fact.text}</span>
													{/if}
												</span>
											</span>
											<span
												class="col-span-2 flex flex-wrap gap-x-2 font-mono text-xs @min-[40rem]:col-span-1 @min-[40rem]:grid @min-[40rem]:justify-items-end @min-[40rem]:gap-0.5"
											>
												<span class={['font-medium', TONE_TEXT[next.primary.tone]]}>{next.primary.text}</span>
												<span class="text-muted-foreground">{next.due}</span>
											</span>
											{#if item.kind === 'full'}
												<ChevronRight
													class="hidden size-4 text-muted-foreground @min-[40rem]:block"
													aria-hidden="true"
												/>
											{/if}
										</svelte:element>
									</li>
								{/each}
							</ul>
						</section>
					{/each}
				</div>
			</div>
		{:else if otherWork !== 'failed'}
			<p class="m-0 text-sm text-muted-foreground">No taskings under this event.</p>
		{/if}
		{#if otherWork === 'failed'}
			<EventLoadFailed title="Other groups’ taskings could not be loaded" />
		{/if}
	{/if}
</section>

{#if creating}
	<TaskingDialog
		orgId={org.orgId}
		orgName={org.orgName}
		linkTo={{ id: event.id, title: event.title, startsOn: event.startsOn, endsOn: event.endsOn }}
		choices={creating}
		{organizationWide}
		onSaved={created}
		onClose={() => (creating = null)}
	/>
{/if}
