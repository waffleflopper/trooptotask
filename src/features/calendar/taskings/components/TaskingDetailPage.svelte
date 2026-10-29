<script lang="ts">
	import type { CalendarEventsPageAccess } from '../../contracts';
	import ClipboardX from '@lucide/svelte/icons/clipboard-x';
	import Ellipsis from '@lucide/svelte/icons/ellipsis';
	import Plus from '@lucide/svelte/icons/plus';
	import { invalidate } from '$app/navigation';
	import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
	import { scopeSetResourceForGroupId } from '$lib/access/scopeSetAccess';
	import * as PageShell from '$lib/components/patterns/page-shell';
	import * as Alert from '$lib/components/ui/alert';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import * as Empty from '$lib/components/ui/empty';
	import * as Select from '$lib/components/ui/select';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { Spinner } from '$lib/components/ui/spinner';
	import { rejectedRequestMessage, withinOrganizationLifetime } from '$lib/stores/core';
	import { formatDate, formatDayMonth, formatWeekdayDayMonth } from '$lib/utils/dates';
	import { PendingSave } from '$lib/utils/pendingSave.svelte';
	import { StreamedValue } from '$lib/utils/streamedValue.svelte';
	import { eventDayRange, type EventRead } from '../../events/eventModel';
	import EventLoadFailed from '../../events/components/EventLoadFailed.svelte';
	import { memberLabel } from '../../events/components/eventLabels';
	import type { EventContribution } from '../eventWorkModel';
	import {
		TASKING_TRANSITIONS,
		availableActions,
		isEditable,
		type Tasking,
		type TaskingAction,
		type TaskingActivityLog,
		type TaskingChoices,
		type TaskingDetail,
		type TaskingStatusKind
	} from '../taskingModel';
	import type { TaskingLists } from '../taskingListsModel';
	import { transitionTaskingRequest } from '../taskingRequests';
	import EventsTaskingsHeader from './EventsTaskingsHeader.svelte';
	import ResponsibilityPill from './ResponsibilityPill.svelte';
	import TaskingDialog from './TaskingDialog.svelte';
	import TaskingListsSection from './TaskingListsSection.svelte';
	import TaskingTransitionDialog from './TaskingTransitionDialog.svelte';
	import AssignPeopleDialog from '../staffing/components/AssignPeopleDialog.svelte';
	import TaskingPeople from '../staffing/components/TaskingPeople.svelte';
	import { TaskingStaffingState } from '../staffing/components/staffingState.svelte';
	import type { AvailabilityCoverage, StaffingPersonState, TaskingStaffing } from '../staffing/staffingModel';
	import {
		STATUS_BADGES,
		describeActivity,
		responsibilityLabel,
		statusMoment,
		statusSentence,
		suspenseNote,
		whoCanNote
	} from './taskingLabels';

	interface Props {
		org: CalendarEventsPageAccess;
		today: string;
		detail: Promise<EventRead<TaskingDetail>>;
		activity: Promise<EventRead<TaskingActivityLog>>;
		lists: Promise<EventRead<TaskingLists>>;
		choices: Promise<EventRead<TaskingChoices | null>>;
		people: Promise<EventRead<TaskingStaffing>>;
		pickStates: Promise<EventRead<Record<string, StaffingPersonState>>>;
		/** The Event's other Taskings as counts, for a reader who cannot open them all. */
		restOfEvent: Promise<EventRead<EventContribution[]>>;
		availabilityGaps: Promise<EventRead<AvailabilityCoverage>>;
		/** Opens Edit once, for a link that asks to change this Tasking's dates. */
		editOnArrival?: boolean;
	}

	let {
		org,
		today,
		detail,
		activity,
		lists,
		choices,
		people,
		pickStates,
		restOfEvent,
		availabilityGaps,
		editOnArrival = false
	}: Props = $props();

	const STATUS_DOT: Record<TaskingStatusKind, string> = {
		open: 'bg-muted-foreground',
		in_progress: 'bg-info',
		blocked: 'bg-danger',
		completed: 'bg-success',
		cancelled: 'bg-muted-foreground'
	};
	const RAIL_ACTIONS: Record<TaskingStatusKind, TaskingAction[]> = {
		open: ['start', 'block'],
		in_progress: ['block', 'complete'],
		blocked: ['unblock', 'complete'],
		completed: ['reopen'],
		cancelled: []
	};
	const RAIL_LABELS: Record<TaskingAction, string> = {
		start: 'Start',
		block: 'Mark blocked',
		unblock: 'Unblock',
		complete: 'Complete',
		reopen: 'Reopen',
		cancel: 'Cancel tasking'
	};

	const taskingsHref = $derived(`/org/${org.orgUrlSegment}/calendar/taskings`);
	const streamedDetail = new StreamedValue(() => detail);
	const streamedActivity = new StreamedValue(() => activity);
	const streamedRest = new StreamedValue(() => restOfEvent);
	const staffing = new TaskingStaffingState(
		() => people,
		() => org.orgId
	);

	// A save answers with the stored Tasking; it stands until the refreshed detail arrives.
	let saved = $state.raw<{ tasking: Tasking; over: unknown } | null>(null);
	let dialog = $state<{ kind: 'edit'; choices: TaskingChoices } | { kind: 'block' | 'complete' | 'cancel' } | null>(
		null
	);
	let actionError = $state('');
	let movingBy = $state<TaskingAction | null>(null);
	let alive = true;
	// Choosing any other action drops an Edit still waiting on its choices.
	let editIntent = 0;
	const moving = new PendingSave();

	let arrivalHandled = false;

	$effect(() => () => (alive = false));

	$effect(() => {
		if (!editOnArrival || arrivalHandled || typeof loaded !== 'object' || loaded === null) return;
		arrivalHandled = true;
		if (canManage && isEditable(loaded.tasking)) void startEdit();
	});

	const loaded = $derived.by(() => {
		const current = streamedDetail.current;
		if (current.state !== 'ready') return current.state === 'failed' ? ('failed' as const) : null;
		if (current.value.status !== 'loaded') return current.value.status;
		const tasking = saved?.over === current ? saved.tasking : current.value.value.tasking;
		return { ...current.value.value, tasking };
	});
	const tasking = $derived(typeof loaded === 'object' && loaded ? loaded.tasking : null);
	const activityLoaded = $derived.by(() => {
		const current = streamedActivity.current;
		if (current.state !== 'ready') return current.state === 'failed' ? ('failed' as const) : null;
		return current.value.status === 'loaded' ? current.value.value : ('failed' as const);
	});
	const rest = $derived.by(() => {
		const current = streamedRest.current;
		if (current.state === 'pending' || current.state === 'absent') return null;
		return current.state === 'ready' && current.value.status === 'loaded' ? current.value.value : ('failed' as const);
	});
	const groups = $derived(typeof loaded === 'object' && loaded ? loaded.groups : {});
	const groupCatalog = $derived(typeof loaded === 'object' && loaded ? loaded.groupCatalog : []);
	const members = $derived(typeof loaded === 'object' && loaded ? loaded.members : {});
	const canManage = $derived(
		tasking !== null &&
			org.affordanceForFeatureAction(POLICY_ACTION_CATALOG.calendar.manageTaskings, tasking.responsibility).allowed
	);
	const organizationWide = $derived(
		org.affordanceForFeatureAction(POLICY_ACTION_CATALOG.calendar.manageTaskings, { kind: 'organization' }).allowed
	);
	// A reader who sees every Group opens the Event itself; anyone narrower gets the other Taskings as counts.
	const seesWholeOrganization = $derived(
		org.affordanceForFeatureAction(POLICY_ACTION_CATALOG.calendar.viewAvailability, { kind: 'organization' }).allowed
	);
	const picks = $derived(typeof staffing.current === 'object' ? staffing.current : null);

	const canSetAvailability = (groupId: string | null) =>
		org.affordanceForFeatureAction(
			POLICY_ACTION_CATALOG.calendar.manageAvailability,
			scopeSetResourceForGroupId(groupId)
		).allowed;

	function stored(next: Tasking) {
		saved = { tasking: next, over: streamedDetail.current };
		dialog = null;
		actionError = '';
		void invalidate('app:calendar-events');
	}

	async function startEdit() {
		actionError = '';
		const intent = ++editIntent;
		const requested = choices;
		const result = await requested;
		if (!alive || requested !== choices || intent !== editIntent) return;
		if (result.status === 'loaded' && result.value) dialog = { kind: 'edit', choices: result.value };
		else actionError = 'The groups and events to choose from could not be loaded. Try again in a moment.';
	}

	function act(current: Tasking, action: TaskingAction) {
		editIntent++;
		if (action === 'block' || action === 'complete' || action === 'cancel') {
			dialog = { kind: action };
			return;
		}
		void moving.run(async () => {
			actionError = '';
			movingBy = action;
			try {
				stored(
					await withinOrganizationLifetime(transitionTaskingRequest(org.orgId, current.id, { action }), () => alive)
				);
			} catch (error) {
				actionError = rejectedRequestMessage(error, 'The status did not change. Try again.');
			} finally {
				movingBy = null;
			}
		});
	}

	/** Each status the Select offers, with the action that moves there. Cancel stays in the overflow menu. */
	function moves(current: Tasking): Map<TaskingStatusKind, TaskingAction> {
		const map = new Map<TaskingStatusKind, TaskingAction>();
		for (const action of availableActions(current.status.kind))
			if (action !== 'cancel') map.set(TASKING_TRANSITIONS[action].to, action);
		return map;
	}

	function shortfall(current: Tasking): boolean {
		const required = current.requirement?.count ?? null;
		return picks !== null && required !== null && picks.picked < required;
	}

	const activityDay = (at: string) => formatDayMonth(formatDate(new Date(at)));
	const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);
	const contributionLabel = (contribution: EventContribution) =>
		`${contribution.responsibility.kind === 'organization' ? 'Organization' : contribution.responsibility.name} · ${contribution.title}`;
</script>

{#snippet actions()}
	{#if tasking && canManage}
		{@const kind = tasking.status.kind}
		<div class="flex flex-wrap items-center gap-2">
			{#if isEditable(tasking)}
				<Button variant="outline" onclick={startEdit} disabled={moving.pending}>Edit</Button>
			{/if}
			{#if kind === 'blocked'}
				<Button onclick={() => act(tasking, 'unblock')} disabled={moving.pending}>
					{#if movingBy === 'unblock'}<Spinner />{/if}
					Unblock
				</Button>
			{:else if kind === 'completed'}
				<Button variant="outline" onclick={() => act(tasking, 'reopen')} disabled={moving.pending}>
					{#if movingBy === 'reopen'}<Spinner />{/if}
					Reopen
				</Button>
			{:else if kind !== 'cancelled'}
				{#if staffing.current === null}
					<Skeleton class="h-9 w-36" />
				{:else if picks}
					{#if shortfall(tasking)}
						<Button onclick={() => (staffing.assigning = true)}>
							<Plus data-icon="inline-start" aria-hidden="true" />Assign people
						</Button>
					{:else}
						<Button variant="outline" onclick={() => (staffing.assigning = true)}>
							{picks.picks.length > 0 ? 'Change people' : 'Assign people'}
						</Button>
					{/if}
				{/if}
			{/if}
		</div>
	{/if}
{/snippet}

{#snippet strip()}
	{#if tasking}
		{@const badge = STATUS_BADGES[tasking.status.kind]}
		<div class="grow"></div>
		<Badge variant={badge.variant}>{badge.label}</Badge>
		<ResponsibilityPill responsibility={tasking.responsibility} {groups} />
		{#if canManage && availableActions(tasking.status.kind).includes('cancel')}
			<DropdownMenu.Root>
				<DropdownMenu.Trigger>
					{#snippet child({ props })}
						<Button {...props} variant="outline" size="icon" aria-label="More tasking actions">
							<Ellipsis />
						</Button>
					{/snippet}
				</DropdownMenu.Trigger>
				<DropdownMenu.Content align="end">
					<DropdownMenu.Item variant="destructive" onSelect={() => act(tasking, 'cancel')}>
						Cancel tasking
					</DropdownMenu.Item>
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

{#snippet cell(heading: string, value: string, secondary: string | null, href?: string)}
	<div
		class="grid content-start gap-1 border-b border-border px-4 py-[14px] last:border-b-0 @min-[34rem]:border-r @min-[34rem]:border-b-0 @min-[34rem]:last:border-r-0"
	>
		{@render label(heading)}
		{#if href}
			<a {href} class="text-sm leading-5 font-medium underline underline-offset-3 wrap-anywhere">{value}</a>
		{:else}
			<span class="text-sm leading-5 font-medium wrap-anywhere">{value}</span>
		{/if}
		{#if secondary}
			<span class="font-mono text-xs text-muted-foreground">{secondary}</span>
		{/if}
	</div>
{/snippet}

<PageShell.Root width="wide">
	<EventsTaskingsHeader
		orgUrlSegment={org.orgUrlSegment}
		section="taskings"
		detail
		title={tasking ? tasking.title : loaded === null ? null : 'Tasking'}
		{actions}
		{strip}
	/>

	{#if loaded === null}
		<div class="@container" role="status" aria-label="Loading tasking">
			<div class="grid items-start gap-7 @min-[60rem]:grid-cols-[minmax(0,1fr)_320px]">
				<div class="grid gap-4">
					<Skeleton class="h-[78px] w-full rounded-lg" />
					<Skeleton class="h-48 w-full rounded-lg" />
					<Skeleton class="h-28 w-full rounded-lg" />
				</div>
				<div class="grid gap-4">
					<Skeleton class="h-44 w-full rounded-lg" />
					<Skeleton class="h-24 w-full rounded-lg" />
				</div>
			</div>
		</div>
	{:else if loaded === 'gone'}
		<Empty.Root class="rounded-lg border">
			<Empty.Media variant="icon"><ClipboardX /></Empty.Media>
			<Empty.Header>
				<Empty.Title>This tasking is not available</Empty.Title>
				<Empty.Description>It may belong to a group outside your access, or the link is wrong.</Empty.Description>
			</Empty.Header>
			<Empty.Content>
				<Button variant="outline" href={taskingsHref}>Back to Taskings</Button>
			</Empty.Content>
		</Empty.Root>
	{:else if loaded === 'failed'}
		<EventLoadFailed title="This tasking could not be loaded" />
	{:else if tasking}
		{@const status = tasking.status}
		{@const statusMoves = moves(tasking)}
		{@const who = whoCanNote(tasking, groups, { canManage, organizationWide })}
		<div class="@container">
			<div class="grid items-start gap-7 @min-[60rem]:grid-cols-[minmax(0,1fr)_320px]">
				<div class="grid min-w-0 gap-4">
					{#if actionError}
						<Alert.Root variant="destructive">
							<Alert.Description>{actionError}</Alert.Description>
						</Alert.Root>
					{/if}

					<div class="@container rounded-lg border border-border bg-card">
						<div class="grid @min-[34rem]:grid-cols-3">
							{#if tasking.event}
								{@render cell(
									'Event',
									tasking.event.title,
									tasking.event.cancelled ? 'Cancelled' : null,
									`/org/${org.orgUrlSegment}/calendar/events/${tasking.event.id}`
								)}
							{:else}
								{@render cell('Event', 'Standalone · no event', null)}
							{/if}
							{#if tasking.execution}
								{@render cell(
									'People committed',
									eventDayRange(tasking.execution, today),
									tasking.execution.reportTime ? `Report ${tasking.execution.reportTime.replace(':', '')}` : null
								)}
							{:else}
								{@const needed = tasking.requirement?.count ?? 0}
								{@render cell(
									'Responsible',
									responsibilityLabel(tasking.responsibility, groups, org.orgName),
									needed === 0 ? 'No people needed' : `${needed} ${needed === 1 ? 'person' : 'people'} needed`
								)}
							{/if}
							{@render cell(
								'Suspense',
								eventDayRange({ startsOn: tasking.suspenseOn, endsOn: tasking.suspenseOn }, today),
								suspenseNote(tasking, today)
							)}
						</div>
					</div>

					{#if status.kind === 'blocked'}
						<div
							class="grid gap-[10px] rounded-lg border border-l-4 border-danger/25 border-l-danger bg-danger/6 px-[18px] py-4"
						>
							<div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
								<div class="flex flex-wrap items-baseline gap-x-2.5">
									<span class="font-heading text-xl leading-6 font-semibold text-danger-foreground">Blocked</span>
									<span class="font-mono text-xs text-muted-foreground">
										since {formatWeekdayDayMonth(formatDate(new Date(status.at)))} · {memberLabel(status.by, members)}
									</span>
								</div>
								{#if canManage}
									<button
										type="button"
										class="text-sm font-medium underline underline-offset-3"
										onclick={() => act(tasking, 'block')}
									>
										Edit reason
									</button>
								{/if}
							</div>
							<p class="m-0 text-[15px] leading-[22px] whitespace-pre-line">{status.reason}</p>
						</div>
					{:else if status.kind === 'completed' || status.kind === 'cancelled'}
						{@const completed = status.kind === 'completed'}
						{@const note = completed ? status.note : status.reason}
						<div
							class={[
								'grid gap-[10px] rounded-lg border border-l-4 px-[18px] py-4',
								completed
									? 'border-success/25 border-l-success bg-success/6'
									: 'border-border border-l-muted-foreground bg-muted'
							]}
						>
							<div class="flex flex-wrap items-baseline gap-x-2.5">
								<span
									class={[
										'font-heading text-xl leading-6 font-semibold',
										completed ? 'text-success-foreground' : 'text-foreground'
									]}
								>
									{completed ? 'Completed' : 'Cancelled'}
								</span>
								<span class="font-mono text-xs text-muted-foreground">
									{statusMoment(status.at)} · {memberLabel(status.by, members)}
								</span>
							</div>
							{#if note}
								<p class="m-0 text-[15px] leading-[22px] whitespace-pre-line">{note}</p>
							{/if}
						</div>
					{/if}

					<TaskingPeople
						orgId={org.orgId}
						{tasking}
						{groups}
						{groupCatalog}
						{staffing}
						{pickStates}
						{canManage}
						{today}
						orgUrlSegment={org.orgUrlSegment}
						{canSetAvailability}
						{availabilityGaps}
					/>

					<TaskingListsSection
						orgId={org.orgId}
						taskingId={tasking.id}
						{lists}
						canEdit={canManage && isEditable(tasking)}
						returning={status.kind === 'completed'}
						canReturn={canManage && status.kind === 'completed'}
						blocked={status.kind === 'blocked'}
						onChanged={() => void invalidate('app:calendar-events')}
					/>
				</div>

				<aside class="grid min-w-0 grid-cols-1 gap-4" aria-label="Tasking status and history">
					<section class="grid gap-3 rounded-lg border border-border bg-card p-4" aria-label="Status">
						{@render label('Status')}
						<Select.Root
							type="single"
							bind:value={
								() => status.kind,
								(next) => {
									const action = statusMoves.get(next as TaskingStatusKind);
									if (action) act(tasking, action);
								}
							}
							disabled={!canManage || moving.pending || statusMoves.size === 0}
						>
							<Select.Trigger class="h-[34px] w-full disabled:opacity-100" aria-label="Status">
								<span class="flex items-center gap-2">
									<span class={['size-2 shrink-0 rounded-full', STATUS_DOT[status.kind]]} aria-hidden="true"></span>
									<span class="text-sm font-medium">{STATUS_BADGES[status.kind].label}</span>
								</span>
							</Select.Trigger>
							<Select.Content>
								<Select.Item value={status.kind} label={STATUS_BADGES[status.kind].label} />
								{#each statusMoves as [target] (target)}
									<Select.Item value={target} label={STATUS_BADGES[target].label} />
								{/each}
							</Select.Content>
						</Select.Root>
						{#if canManage && RAIL_ACTIONS[status.kind].length > 0}
							<div class="flex gap-2">
								{#each RAIL_ACTIONS[status.kind] as action (action)}
									<Button
										variant="outline"
										size="sm"
										class="h-8 grow basis-0"
										onclick={() => act(tasking, action)}
										disabled={moving.pending}
									>
										{#if movingBy === action}<Spinner />{/if}
										{RAIL_LABELS[action]}
									</Button>
								{/each}
							</div>
						{/if}
						<p class="m-0 text-[13px] leading-[19px] text-muted-foreground">
							{statusSentence(tasking, picks?.picked ?? null, today)}
						</p>
					</section>

					{#if tasking.event && !seesWholeOrganization}
						<section
							class="grid grid-cols-1 gap-2 rounded-lg border border-border bg-card p-4"
							aria-label="Rest of the event"
						>
							{@render label('Rest of the event')}
							{#if rest === null}
								<div class="grid gap-2" role="status" aria-label="Loading the rest of the event">
									<Skeleton class="h-5 w-full" />
									<Skeleton class="h-5 w-4/5" />
								</div>
							{:else if rest === 'failed'}
								<p class="m-0 text-[13px] text-muted-foreground">The event's other taskings could not be loaded.</p>
							{:else if rest.length === 0}
								<p class="m-0 text-[13px] text-muted-foreground">This is the event's only tasking.</p>
							{:else}
								<ul class="m-0 grid list-none grid-cols-1 gap-1.5 p-0">
									{#each rest as contribution (contribution.id)}
										<li class="flex items-baseline justify-between gap-3 text-sm">
											<span class="min-w-0 truncate">{contributionLabel(contribution)}</span>
											{#if contribution.status === 'blocked'}
												<span class="shrink-0 font-mono text-xs text-danger-foreground">Blocked</span>
											{:else if contribution.status === 'completed' || contribution.status === 'cancelled' || contribution.required === null}
												<span class="shrink-0 font-mono text-xs text-muted-foreground">
													{STATUS_BADGES[contribution.status].label}
												</span>
											{:else}
												<span
													class={[
														'shrink-0 font-mono text-xs tabular-nums',
														contribution.picked >= contribution.required
															? 'text-success-foreground'
															: 'text-accent-text'
													]}
												>
													{contribution.picked} of {contribution.required}
												</span>
											{/if}
										</li>
									{/each}
								</ul>
								<p class="m-0 text-xs text-muted-foreground">Counts only. Other Groups' people are not shown.</p>
							{/if}
						</section>
					{/if}

					{#if tasking.instructions}
						<section class="grid gap-2 rounded-lg border border-border bg-card p-4" aria-label="Instructions">
							{@render label('Instructions')}
							<p class="m-0 text-sm leading-[21px] wrap-anywhere whitespace-pre-line">{tasking.instructions}</p>
						</section>
					{/if}

					{#if who}
						<section class="grid gap-2 rounded-lg bg-muted p-4" aria-label={who.label}>
							{@render label(who.label)}
							<p class="m-0 text-[13px] leading-[19px]">{who.text}</p>
						</section>
					{/if}

					<section class="grid gap-2 px-1" aria-labelledby="tasking-activity-heading">
						<h2
							id="tasking-activity-heading"
							class="m-0 font-mono text-[11px] leading-[14px] font-medium tracking-[0.08em] text-muted-foreground uppercase"
						>
							Activity
						</h2>
						{#if activityLoaded === null}
							<div class="grid gap-2" role="status" aria-label="Loading activity">
								{#each [0, 1, 2] as placeholder (placeholder)}
									<Skeleton class="h-5 w-full" />
								{/each}
							</div>
						{:else if activityLoaded === 'failed'}
							<EventLoadFailed title="Activity could not be loaded" />
						{:else}
							<ol class="m-0 grid list-none gap-2 p-0">
								{#each [...activityLoaded.entries].reverse() as entry (entry.id)}
									{@const line = describeActivity(entry, groups, activityLoaded.eventTitles, org.orgName)}
									<li class="flex gap-2.5">
										<time datetime={entry.at} class="w-12 shrink-0 pt-px font-mono text-xs text-muted-foreground">
											{activityDay(entry.at)}
										</time>
										<span class="grid min-w-0 gap-0.5 text-[13px] leading-[18px]">
											<span class="wrap-anywhere"
												>{memberLabel(entry.actorUserId, members)} {lowerFirst(line.summary)}</span
											>
											{#if line.note}
												<span class="wrap-anywhere whitespace-pre-line text-muted-foreground">{line.note}</span>
											{/if}
										</span>
									</li>
								{/each}
							</ol>
						{/if}
					</section>
				</aside>
			</div>
		</div>
	{/if}
</PageShell.Root>

{#if tasking && dialog}
	{#if dialog.kind === 'edit'}
		<TaskingDialog
			orgId={org.orgId}
			orgName={org.orgName}
			{tasking}
			choices={dialog.choices}
			{organizationWide}
			onSaved={stored}
			onClose={() => (dialog = null)}
		/>
	{:else}
		<TaskingTransitionDialog
			orgId={org.orgId}
			{tasking}
			action={dialog.kind}
			onMoved={stored}
			onClose={() => (dialog = null)}
		/>
	{/if}
{/if}

{#if tasking && staffing.assigning}
	{@const current = tasking}
	<AssignPeopleDialog
		orgId={org.orgId}
		tasking={current}
		groups={groupCatalog}
		{today}
		onSaved={(result, before) => {
			if (before) staffing.saved(current, before, result, today);
			else staffing.show(result);
			staffing.assigning = false;
		}}
		onClose={() => (staffing.assigning = false)}
	/>
{/if}
