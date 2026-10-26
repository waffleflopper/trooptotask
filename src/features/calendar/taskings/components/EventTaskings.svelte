<script lang="ts">
	import type { CalendarEventsPageAccess } from '../../contracts';
	import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
	import * as Alert from '$lib/components/ui/alert';
	import { Button } from '$lib/components/ui/button';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { StreamedValue } from '$lib/utils/streamedValue.svelte';
	import type { CalendarEvent, EventRead } from '../../events/eventModel';
	import EventLoadFailed from '../../events/components/EventLoadFailed.svelte';
	import { reloadCalendarEvents } from '../../events/eventPageState';
	import { groupEventWork, type TaskingSummary } from '../eventWorkModel';
	import { isActiveStatus, type GroupLabels, type Tasking, type TaskingChoices } from '../taskingModel';
	import EventWorkGroups from './EventWorkGroups.svelte';
	import TaskingDialog from './TaskingDialog.svelte';

	interface Props {
		org: CalendarEventsPageAccess;
		today: string;
		event: CalendarEvent;
		taskings: Promise<EventRead<{ taskings: Tasking[]; groups: GroupLabels }>>;
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
	const hasActiveWork = $derived(
		(work ?? []).some((group) =>
			group.items.some((item) => isActiveStatus(item.kind === 'full' ? item.tasking.status.kind : item.summary.status))
		)
	);

	$effect(() => {
		if (!addOnArrival || arrivalHandled || !canCreate || event.cancellation) return;
		arrivalHandled = true;
		void startCreate();
	});

	async function startCreate() {
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

<section class="grid gap-3" aria-labelledby="event-taskings-heading">
	<div class="flex flex-wrap items-center justify-between gap-2">
		<h2 id="event-taskings-heading" class="font-heading text-lg font-semibold">Taskings</h2>
		{#if canCreate && !event.cancellation}
			<Button variant="outline" size="sm" onclick={startCreate}>Add tasking</Button>
		{/if}
	</div>
	{#if createError}
		<Alert.Root variant="destructive">
			<Alert.Description>{createError}</Alert.Description>
		</Alert.Root>
	{/if}
	{#if loaded === null || otherWork === null}
		<div class="grid gap-2" role="status" aria-label="Loading taskings">
			{#each [0, 1] as placeholder (placeholder)}
				<Skeleton class="h-14 w-full" />
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
			<EventWorkGroups {org} {today} groups={work} groupLabels={loaded.groups} />
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
