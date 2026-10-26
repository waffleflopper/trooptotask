<script lang="ts">
	import type { CalendarEventsPageAccess } from '../../contracts';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import ClipboardX from '@lucide/svelte/icons/clipboard-x';
	import { invalidate } from '$app/navigation';
	import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
	import { scopeSetResourceForGroupId } from '$lib/access/scopeSetAccess';
	import * as PageShell from '$lib/components/patterns/page-shell';
	import * as Alert from '$lib/components/ui/alert';
	import { Button } from '$lib/components/ui/button';
	import * as Empty from '$lib/components/ui/empty';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { Spinner } from '$lib/components/ui/spinner';
	import { rejectedRequestMessage, withinOrganizationLifetime } from '$lib/stores/core';
	import { formatDayMonthYear, formatDisplayDateTime } from '$lib/utils/dates';
	import { PendingSave } from '$lib/utils/pendingSave.svelte';
	import { StreamedValue } from '$lib/utils/streamedValue.svelte';
	import { eventDateRange, type EventRead } from '../../events/eventModel';
	import EventLoadFailed from '../../events/components/EventLoadFailed.svelte';
	import { memberLabel } from '../../events/components/eventLabels';
	import {
		availableActions,
		isEditable,
		type Tasking,
		type TaskingAction,
		type TaskingActivityLog,
		type TaskingChoices,
		type TaskingDetail
	} from '../taskingModel';
	import type { TaskingLists } from '../taskingListsModel';
	import { transitionTaskingRequest } from '../taskingRequests';
	import TaskingDialog from './TaskingDialog.svelte';
	import TaskingListsSection from './TaskingListsSection.svelte';
	import TaskingStatusBadges from './TaskingStatusBadges.svelte';
	import TaskingTransitionDialog from './TaskingTransitionDialog.svelte';
	import TaskingPeople from '../staffing/components/TaskingPeople.svelte';
	import type { AvailabilityCoverage, TaskingStaffing } from '../staffing/staffingModel';
	import {
		ACTION_LABELS,
		describeActivity,
		executionLabel,
		requirementLabel,
		responsibilityLabel
	} from './taskingLabels';

	interface Props {
		org: CalendarEventsPageAccess;
		today: string;
		detail: Promise<EventRead<TaskingDetail>>;
		activity: Promise<EventRead<TaskingActivityLog>>;
		lists: Promise<EventRead<TaskingLists>>;
		choices: Promise<EventRead<TaskingChoices | null>>;
		people: Promise<EventRead<TaskingStaffing>>;
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
		availabilityGaps,
		editOnArrival = false
	}: Props = $props();

	const taskingsHref = $derived(`/org/${org.orgUrlSegment}/calendar/taskings`);
	const streamedDetail = new StreamedValue(() => detail);
	const streamedActivity = new StreamedValue(() => activity);

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
	const activityLoaded = $derived.by(() => {
		const current = streamedActivity.current;
		if (current.state !== 'ready') return current.state === 'failed' ? ('failed' as const) : null;
		return current.value.status === 'loaded' ? current.value.value : ('failed' as const);
	});
	const groups = $derived(typeof loaded === 'object' && loaded ? loaded.groups : {});
	const members = $derived(typeof loaded === 'object' && loaded ? loaded.members : {});
	const canManage = $derived(
		typeof loaded === 'object' &&
			loaded !== null &&
			org.affordanceForFeatureAction(POLICY_ACTION_CATALOG.calendar.manageTaskings, loaded.tasking.responsibility)
				.allowed
	);
	const organizationWide = $derived(
		org.affordanceForFeatureAction(POLICY_ACTION_CATALOG.calendar.manageTaskings, { kind: 'organization' }).allowed
	);

	const canSetAvailability = (groupId: string | null) =>
		org.affordanceForFeatureAction(
			POLICY_ACTION_CATALOG.calendar.manageAvailability,
			scopeSetResourceForGroupId(groupId)
		).allowed;

	function stored(tasking: Tasking) {
		saved = { tasking, over: streamedDetail.current };
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

	function act(tasking: Tasking, action: TaskingAction) {
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
					await withinOrganizationLifetime(transitionTaskingRequest(org.orgId, tasking.id, { action }), () => alive)
				);
			} catch (error) {
				actionError = rejectedRequestMessage(error, 'The status did not change. Try again.');
			} finally {
				movingBy = null;
			}
		});
	}
</script>

{#snippet back()}
	<Button variant="ghost" size="icon-sm" href={taskingsHref} aria-label="Back to Taskings">
		<ArrowLeft />
	</Button>
{/snippet}

<PageShell.Root width="content" density="compact">
	{#if loaded === null}
		<div class="grid gap-6" role="status" aria-label="Loading tasking">
			<div class="flex items-center gap-2">
				<Skeleton class="size-8" />
				<Skeleton class="h-8 w-2/3 max-w-md" />
			</div>
			<div class="grid gap-3">
				{#each [0, 1, 2, 3, 4, 5, 6] as placeholder (placeholder)}
					<Skeleton class="h-8 w-full" />
				{/each}
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
		<PageShell.Header title="Tasking" {back} />
		<EventLoadFailed title="This tasking could not be loaded" />
	{:else}
		{@const { tasking } = loaded}
		{@const status = tasking.status}
		{@const actions = canManage ? availableActions(status.kind) : []}
		<PageShell.Header title={tasking.title} {back}>
			{#snippet meta()}
				<TaskingStatusBadges {tasking} {today} />
			{/snippet}
			{#snippet aside()}
				{#if canManage && (actions.length > 0 || isEditable(tasking))}
					<div class="flex flex-wrap gap-2">
						{#each actions as action, index (action)}
							<Button
								variant={index === 0 && action !== 'cancel' ? 'default' : 'outline'}
								onclick={() => act(tasking, action)}
								disabled={moving.pending}
							>
								{#if movingBy === action}<Spinner />{/if}
								{ACTION_LABELS[action]}
							</Button>
						{/each}
						{#if isEditable(tasking)}
							<Button variant="outline" onclick={startEdit} disabled={moving.pending}>Edit</Button>
						{/if}
					</div>
				{/if}
			{/snippet}
		</PageShell.Header>

		{#if actionError}
			<Alert.Root variant="destructive">
				<Alert.Description>{actionError}</Alert.Description>
			</Alert.Root>
		{/if}

		{#if status.kind === 'blocked' || status.kind === 'completed' || status.kind === 'cancelled'}
			{@const note = status.kind === 'completed' ? status.note : status.reason}
			<Alert.Root>
				<Alert.Title>
					{status.kind === 'blocked' ? 'Blocked' : status.kind === 'completed' ? 'Completed' : 'Cancelled'}
					{formatDisplayDateTime(status.at)} by {memberLabel(status.by, members)}
				</Alert.Title>
				{#if note}
					<Alert.Description class="whitespace-pre-line">{note}</Alert.Description>
				{/if}
			</Alert.Root>
		{/if}

		<dl>
			<PageShell.FactRow label="Responsible" value={responsibilityLabel(tasking.responsibility, groups, org.orgName)} />
			{#if tasking.event}
				<PageShell.FactRow label="Event">
					<a
						href={`/org/${org.orgUrlSegment}/calendar/events/${tasking.event.id}`}
						class="underline underline-offset-3"
					>
						{tasking.event.title}</a
					>
					<span class="text-muted-foreground">
						· {eventDateRange(tasking.event)}{tasking.event.cancelled ? ' · Cancelled' : ''}
					</span>
				</PageShell.FactRow>
			{:else}
				<PageShell.FactRow label="Event" value="Standalone" />
			{/if}
			<PageShell.FactRow label="Suspense" value={formatDayMonthYear(tasking.suspenseOn)} />
			<PageShell.FactRow label="Execution" value={executionLabel(tasking.execution)} />
			<PageShell.FactRow label="Report time" value={tasking.execution?.reportTime ?? null} mono />
			<PageShell.FactRow label="Requirement" value={requirementLabel(tasking.requirement)} />
			{#if tasking.instructions}
				<PageShell.FactRow label="Instructions">
					<p class="m-0 wrap-anywhere whitespace-pre-line">{tasking.instructions}</p>
				</PageShell.FactRow>
			{:else}
				<PageShell.FactRow label="Instructions" value={null} />
			{/if}
		</dl>

		<TaskingPeople
			orgId={org.orgId}
			{tasking}
			{groups}
			{people}
			{canManage}
			orgUrlSegment={org.orgUrlSegment}
			{canSetAvailability}
			{availabilityGaps}
		/>
	{/if}

	{#if loaded !== 'gone' && loaded !== 'failed'}
		<TaskingListsSection
			orgId={org.orgId}
			taskingId={typeof loaded === 'object' && loaded ? loaded.tasking.id : ''}
			{lists}
			{members}
			canEdit={canManage && typeof loaded === 'object' && loaded !== null && isEditable(loaded.tasking)}
			onChanged={() => void invalidate('app:calendar-events')}
		/>
	{/if}

	{#if loaded !== 'gone'}
		<section class="grid gap-3" aria-labelledby="tasking-activity-heading">
			<h2 id="tasking-activity-heading" class="font-heading text-lg font-semibold">Activity</h2>
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
					{#each activityLoaded.entries as entry (entry.id)}
						{@const line = describeActivity(entry, groups, activityLoaded.eventTitles, org.orgName)}
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

{#if typeof loaded === 'object' && loaded !== null && dialog}
	{#if dialog.kind === 'edit'}
		<TaskingDialog
			orgId={org.orgId}
			orgName={org.orgName}
			tasking={loaded.tasking}
			choices={dialog.choices}
			{organizationWide}
			onSaved={stored}
			onClose={() => (dialog = null)}
		/>
	{:else}
		<TaskingTransitionDialog
			orgId={org.orgId}
			tasking={loaded.tasking}
			action={dialog.kind}
			onMoved={stored}
			onClose={() => (dialog = null)}
		/>
	{/if}
{/if}
