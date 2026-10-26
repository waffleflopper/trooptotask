<script lang="ts">
	import type { CalendarEventsPageAccess } from '../../contracts';
	import ClipboardList from '@lucide/svelte/icons/clipboard-list';
	import { goto } from '$app/navigation';
	import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
	import * as PageShell from '$lib/components/patterns/page-shell';
	import { WorkspaceToolbar, type ToolbarItem, type ToolbarOption } from '$lib/components/patterns/workspace-toolbar';
	import * as Alert from '$lib/components/ui/alert';
	import { Button } from '$lib/components/ui/button';
	import * as Empty from '$lib/components/ui/empty';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { formatDayMonthYear } from '$lib/utils/dates';
	import { StreamedValue } from '$lib/utils/streamedValue.svelte';
	import type { EventRead } from '../../events/eventModel';
	import EventLoadFailed from '../../events/components/EventLoadFailed.svelte';
	import {
		CLOSED_TASKING_LIMIT,
		DEFAULT_TASKING_FILTERS,
		filterTaskings,
		nextTaskingDate,
		scopeOfView,
		taskingFiltersQuery,
		type Tasking,
		type TaskingChoices,
		type TaskingFilters,
		type TaskingList,
		type TaskingView,
		type TaskingWithin
	} from '../taskingModel';
	import EventsTaskingsTabs from './EventsTaskingsTabs.svelte';
	import ReadinessSummary from './ReadinessSummary.svelte';
	import TaskingDialog from './TaskingDialog.svelte';
	import TaskingStatusBadges from './TaskingStatusBadges.svelte';
	import { responsibilityLabel } from './taskingLabels';
	import { NO_STAFFING, staffingLabel } from '../staffing/staffingModel';

	interface Props {
		org: CalendarEventsPageAccess;
		today: string;
		filters: TaskingFilters;
		list: Promise<EventRead<TaskingList>>;
		choices: Promise<EventRead<TaskingChoices | null>>;
	}

	let { org, today, filters, list, choices }: Props = $props();

	const canCreate = $derived(
		org.affordanceForFeatureAction(POLICY_ACTION_CATALOG.calendar.manageTaskings, { kind: 'unscoped' }).allowed
	);
	const organizationWide = $derived(
		org.affordanceForFeatureAction(POLICY_ACTION_CATALOG.calendar.manageTaskings, { kind: 'organization' }).allowed
	);
	const taskingsHref = $derived(`/org/${org.orgUrlSegment}/calendar/taskings`);
	const streamed = new StreamedValue(() => list);
	// A refresh keeps the shown list; moving to a view that loads another list shows the skeleton until it arrives.
	const loaded = $derived.by(() => {
		const current = streamed.current;
		if (current.state === 'pending' || current.state === 'absent') return null;
		if (current.state === 'failed' || current.value.status !== 'loaded') return 'failed' as const;
		return current.value.value.scope === scopeOfView(filters.view) ? current.value.value : null;
	});
	const shown = $derived(loaded && loaded !== 'failed' ? filterTaskings(loaded.taskings, filters, today) : []);

	function staffingSuffix(count: typeof NO_STAFFING, tasking: Tasking) {
		const label = staffingLabel(count.picked, tasking.requirement?.count ?? null);
		const review = count.needsReview > 0 ? `${count.needsReview} to review` : null;
		return [label, review].map((part) => (part ? ` · ${part}` : '')).join('');
	}
	const filtered = $derived(
		JSON.stringify({ ...filters, view: DEFAULT_TASKING_FILTERS.view }) !== JSON.stringify(DEFAULT_TASKING_FILTERS)
	);
	let creating = $state<TaskingChoices | null>(null);
	let createError = $state('');

	const VIEWS: { value: TaskingView; label: string }[] = [
		{ value: 'active', label: 'Active' },
		{ value: 'overdue', label: 'Overdue' },
		{ value: 'blocked', label: 'Blocked' },
		{ value: 'completed', label: 'Completed' },
		{ value: 'cancelled', label: 'Cancelled' }
	];
	const WITHIN: { value: TaskingWithin; label: string }[] = [
		{ value: 'any', label: 'Any date' },
		{ value: '7', label: 'Next 7 days' },
		{ value: '14', label: 'Next 14 days' },
		{ value: '30', label: 'Next 30 days' }
	];

	const eventOptions = $derived.by<ToolbarOption[]>(() => {
		const events = Object.fromEntries(
			(loaded && loaded !== 'failed' ? loaded.taskings : []).flatMap((tasking) =>
				tasking.event ? [[tasking.event.id, { label: tasking.event.title, startsOn: tasking.event.startsOn }]] : []
			)
		);
		if (!['all', 'standalone'].includes(filters.event) && !(filters.event in events))
			events[filters.event] = { label: 'Another event', startsOn: '' };
		return [
			{ value: 'all', label: 'All events' },
			{ value: 'standalone', label: 'Standalone' },
			...Object.entries(events)
				.sort(([, a], [, b]) => a.startsOn.localeCompare(b.startsOn) || a.label.localeCompare(b.label))
				.map(([value, { label }]) => ({ value, label }))
		];
	});
	const responsibilityOptions = $derived.by<ToolbarOption[]>(() => {
		const groups = loaded && loaded !== 'failed' ? loaded.groups : {};
		const options = Object.entries(groups)
			.map(([value, label]) => ({ value, label }))
			.sort((a, b) => a.label.localeCompare(b.label));
		if (!['all', 'organization'].includes(filters.responsibility) && !(filters.responsibility in groups))
			options.push({ value: filters.responsibility, label: 'Another group' });
		return [{ value: 'all', label: 'Anyone responsible' }, { value: 'organization', label: org.orgName }, ...options];
	});

	function show(next: Partial<TaskingFilters>, replaceState = false) {
		void goto(`${taskingsHref}${taskingFiltersQuery({ ...filters, ...next })}`, {
			keepFocus: true,
			noScroll: true,
			replaceState
		});
	}

	const toolbarItems = $derived<ToolbarItem[]>([
		{
			kind: 'view',
			id: 'view',
			label: 'Show',
			options: VIEWS,
			value: filters.view,
			onValueChange: (value) => show({ view: VIEWS.find((view) => view.value === value)?.value ?? 'active' })
		},
		{
			kind: 'select',
			id: 'event',
			label: 'Event',
			options: eventOptions,
			value: filters.event,
			defaultValue: 'all',
			onValueChange: (event) => show({ event })
		},
		{
			kind: 'select',
			id: 'responsibility',
			label: 'Responsible',
			options: responsibilityOptions,
			value: filters.responsibility,
			defaultValue: 'all',
			onValueChange: (responsibility) => show({ responsibility })
		},
		{
			kind: 'select',
			id: 'within',
			label: 'Dates',
			options: WITHIN,
			value: filters.within,
			defaultValue: 'any',
			onValueChange: (within) => show({ within: WITHIN.find((option) => option.value === within)?.value ?? 'any' })
		},
		{
			kind: 'action',
			id: 'calendar',
			label: 'Calendar',
			icon: 'arrow-left',
			href: `/org/${org.orgUrlSegment}/calendar`
		}
	]);

	async function startCreate() {
		createError = '';
		const requested = choices;
		const result = await requested;
		if (requested !== choices) return;
		if (result.status === 'loaded' && result.value) creating = result.value;
		else createError = 'The groups and events to choose from could not be loaded. Try again in a moment.';
	}

	function created(tasking: Tasking) {
		creating = null;
		void goto(`${taskingsHref}/${tasking.id}`);
	}

	function clearFilters() {
		show({ ...DEFAULT_TASKING_FILTERS, view: filters.view });
	}
</script>

<PageShell.Root width="content" density="compact">
	<PageShell.Header title="Taskings" subtitle="Outcomes the unit owes, who owns each one, and when it is due." />
	<EventsTaskingsTabs orgUrlSegment={org.orgUrlSegment} current="taskings" />
	<WorkspaceToolbar
		ariaLabel="Tasking controls"
		items={toolbarItems}
		compactBelow="sm"
		search={{
			label: 'Search taskings',
			placeholder: 'Search outcomes and events',
			value: filters.search,
			onValueChange: (search) => show({ search }, true)
		}}
		primary={canCreate
			? { kind: 'action', id: 'create', label: 'Create tasking', icon: 'plus', onclick: startCreate }
			: undefined}
	/>

	{#if createError}
		<Alert.Root variant="destructive">
			<Alert.Description>{createError}</Alert.Description>
		</Alert.Root>
	{/if}

	{#if loaded === null}
		<div class="grid gap-2" role="status" aria-label="Loading taskings">
			{#each [0, 1, 2, 3] as placeholder (placeholder)}
				<div class="grid gap-1 rounded-lg border p-3 sm:grid-cols-[9rem_minmax(0,1fr)_auto] sm:items-center sm:gap-3">
					<Skeleton class="h-9 w-24" />
					<div class="grid gap-0.5">
						<Skeleton class="h-6 w-2/3" />
						<Skeleton class="h-5 w-1/2" />
					</div>
					<Skeleton class="h-5 w-24" />
				</div>
			{/each}
		</div>
	{:else if loaded === 'failed'}
		<EventLoadFailed title="Taskings could not be loaded" />
	{:else if shown.length === 0}
		<Empty.Root class="rounded-lg border">
			<Empty.Media variant="icon"><ClipboardList /></Empty.Media>
			<Empty.Header>
				<Empty.Title
					>{filtered
						? 'No taskings match these filters'
						: `No ${VIEWS.find((view) => view.value === filters.view)?.label.toLowerCase()} taskings`}</Empty.Title
				>
				<Empty.Description>
					{filtered
						? 'Clear the filters to see every tasking in this view.'
						: 'Taskings appear here with who owns them and when they are due.'}
				</Empty.Description>
			</Empty.Header>
			{#if filtered}
				<Empty.Content><Button variant="outline" onclick={clearFilters}>Clear filters</Button></Empty.Content>
			{:else if canCreate && filters.view === 'active'}
				<Empty.Content><Button onclick={startCreate}>Create tasking</Button></Empty.Content>
			{/if}
		</Empty.Root>
	{:else}
		<ul class="grid gap-2">
			{#each shown as tasking (tasking.id)}
				{@const next = nextTaskingDate(tasking, today)}
				<li>
					<a
						href={`${taskingsHref}/${tasking.id}`}
						class="grid gap-1 rounded-lg border p-3 transition-colors hover:bg-muted/60 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none sm:grid-cols-[9rem_minmax(0,1fr)_auto] sm:items-center sm:gap-3"
					>
						<span class="flex items-baseline gap-2 sm:grid sm:gap-0">
							<span class="font-mono text-[11px] tracking-[0.08em] text-muted-foreground uppercase">{next.label}</span>
							<span class="font-mono text-sm text-foreground tabular-nums">{formatDayMonthYear(next.on)}</span>
						</span>
						<span class="grid min-w-0 gap-0.5">
							<span class="truncate font-medium text-foreground">{tasking.title}</span>
							<span class="truncate text-sm text-muted-foreground">
								{responsibilityLabel(tasking.responsibility, loaded.groups, org.orgName)} · {tasking.event?.title ??
									'Standalone'}{staffingSuffix(loaded.staffing[tasking.id] ?? NO_STAFFING, tasking)}
							</span>
							<ReadinessSummary readiness={tasking.readiness} />
						</span>
						<TaskingStatusBadges {tasking} {today} />
					</a>
				</li>
			{/each}
		</ul>
		{#if scopeOfView(filters.view) !== 'active' && loaded.taskings.length >= CLOSED_TASKING_LIMIT}
			<p class="text-sm text-muted-foreground">Showing the {CLOSED_TASKING_LIMIT} most recent.</p>
		{/if}
	{/if}
</PageShell.Root>

{#if creating}
	<TaskingDialog
		orgId={org.orgId}
		orgName={org.orgName}
		choices={creating}
		{organizationWide}
		onSaved={created}
		onClose={() => (creating = null)}
	/>
{/if}
