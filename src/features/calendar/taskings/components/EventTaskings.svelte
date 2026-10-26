<script lang="ts">
	import type { CalendarEventsPageAccess } from '../../contracts';
	import { invalidate } from '$app/navigation';
	import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
	import * as Alert from '$lib/components/ui/alert';
	import { Button } from '$lib/components/ui/button';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { formatDayMonthYear } from '$lib/utils/dates';
	import { StreamedValue } from '$lib/utils/streamedValue.svelte';
	import type { CalendarEvent, EventRead } from '../../events/eventModel';
	import EventLoadFailed from '../../events/components/EventLoadFailed.svelte';
	import { nextTaskingDate, type GroupLabels, type Tasking, type TaskingChoices } from '../taskingModel';
	import TaskingDialog from './TaskingDialog.svelte';
	import TaskingStatusBadges from './TaskingStatusBadges.svelte';
	import { responsibilityLabel } from './taskingLabels';

	interface Props {
		org: CalendarEventsPageAccess;
		today: string;
		event: CalendarEvent;
		taskings: Promise<EventRead<{ taskings: Tasking[]; groups: GroupLabels }>>;
		choices: Promise<EventRead<TaskingChoices | null>>;
		/** Opens Create tasking once, for "Create and add tasking". */
		addOnArrival: boolean;
	}

	let { org, today, event, taskings, choices, addOnArrival }: Props = $props();

	const canCreate = $derived(
		org.affordanceForFeatureAction(POLICY_ACTION_CATALOG.calendar.manageTaskings, { kind: 'unscoped' }).allowed
	);
	const organizationWide = $derived(
		org.affordanceForFeatureAction(POLICY_ACTION_CATALOG.calendar.manageTaskings, { kind: 'organization' }).allowed
	);
	const streamed = new StreamedValue(() => taskings);
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
		void invalidate('app:calendar-events');
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
	{#if loaded === null}
		<div class="grid gap-2" role="status" aria-label="Loading taskings">
			{#each [0, 1] as placeholder (placeholder)}
				<Skeleton class="h-14 w-full" />
			{/each}
		</div>
	{:else if loaded === 'failed'}
		<EventLoadFailed title="Taskings could not be loaded" />
	{:else if loaded.taskings.length === 0}
		<p class="m-0 text-sm text-muted-foreground">No taskings under this event.</p>
	{:else}
		<ul class="grid gap-2">
			{#each loaded.taskings as tasking (tasking.id)}
				{@const next = nextTaskingDate(tasking, today)}
				<li>
					<a
						href={`/org/${org.orgUrlSegment}/calendar/taskings/${tasking.id}`}
						class="grid gap-1 rounded-lg border p-3 transition-colors hover:bg-muted/60 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-3"
					>
						<span class="grid min-w-0 gap-0.5">
							<span class="truncate font-medium text-foreground">{tasking.title}</span>
							<span class="truncate text-sm text-muted-foreground">
								{responsibilityLabel(tasking.responsibility, loaded.groups, org.orgName)} · {next.label}
								{formatDayMonthYear(next.on)}
							</span>
						</span>
						<TaskingStatusBadges {tasking} {today} />
					</a>
				</li>
			{/each}
		</ul>
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
