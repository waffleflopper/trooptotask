<script lang="ts">
	import type { CalendarEventsPageAccess } from '../../contracts';
	import ClipboardList from '@lucide/svelte/icons/clipboard-list';
	import Plus from '@lucide/svelte/icons/plus';
	import { goto } from '$app/navigation';
	import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
	import * as PageShell from '$lib/components/patterns/page-shell';
	import { WorkspaceToolbar, type ToolbarItem, type ToolbarOption } from '$lib/components/patterns/workspace-toolbar';
	import * as Alert from '$lib/components/ui/alert';
	import { Button } from '$lib/components/ui/button';
	import * as Empty from '$lib/components/ui/empty';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { StreamedValue } from '$lib/utils/streamedValue.svelte';
	import type { CalendarEvent, EventRead, MemberLabels } from '../../events/eventModel';
	import EventDialog from '../../events/components/EventDialog.svelte';
	import EventLoadFailed from '../../events/components/EventLoadFailed.svelte';
	import {
		CLOSED_TASKING_LIMIT,
		DEFAULT_TASKING_FILTERS,
		filterTaskings,
		scopeOfView,
		taskingFiltersQuery,
		type Tasking,
		type TaskingChoices,
		type TaskingFilters,
		type TaskingList,
		type TaskingView,
		type TaskingWithin
	} from '../taskingModel';
	import { buildGroupTree } from '$features/personnel/contracts';
	import type { TaskingWorkspace } from '../taskingReadModel';
	import type { FactTone } from '../taskingRowModel';
	import EventsTaskingsHeader from './EventsTaskingsHeader.svelte';
	import TaskingDialog from './TaskingDialog.svelte';
	import TaskingsTable from './TaskingsTable.svelte';

	interface Props {
		org: CalendarEventsPageAccess;
		today: string;
		filters: TaskingFilters;
		list: Promise<EventRead<TaskingList>>;
		/** Row facts and chip counts for every Tasking the reader can see. */
		workspace: Promise<EventRead<TaskingWorkspace>>;
		choices: Promise<EventRead<TaskingChoices | null>>;
		eventMembers: Promise<EventRead<MemberLabels | null>>;
	}

	let { org, today, filters, list, workspace, choices, eventMembers }: Props = $props();

	const canCreate = $derived(
		org.affordanceForFeatureAction(POLICY_ACTION_CATALOG.calendar.manageTaskings, { kind: 'unscoped' }).allowed
	);
	const canCreateEvent = $derived(
		org.affordanceForFeatureAction(POLICY_ACTION_CATALOG.calendar.manageEvents, { kind: 'organization' }).allowed
	);
	const organizationWide = $derived(
		org.affordanceForFeatureAction(POLICY_ACTION_CATALOG.calendar.manageTaskings, { kind: 'organization' }).allowed
	);
	const taskingsHref = $derived(`/org/${org.orgUrlSegment}/calendar/taskings`);
	const eventsHref = $derived(`/org/${org.orgUrlSegment}/calendar/events`);
	const streamed = new StreamedValue(() => list);
	const streamedWorkspace = new StreamedValue(() => workspace);
	const facts = $derived.by(() => {
		const current = streamedWorkspace.current;
		if (current.state === 'pending' || current.state === 'absent') return null;
		if (current.state === 'failed' || current.value.status !== 'loaded') return 'failed' as const;
		return current.value.value;
	});
	// A refresh keeps the shown list; moving to a view that loads another list shows the skeleton until it arrives.
	// Rows need their facts too, so a failed facts read fails the table instead of reading as zeros.
	const loaded = $derived.by(() => {
		const current = streamed.current;
		if (current.state === 'pending' || current.state === 'absent' || facts === null) return null;
		if (current.state === 'failed' || current.value.status !== 'loaded' || facts === 'failed') return 'failed' as const;
		return current.value.value.scope === scopeOfView(filters.view) ? current.value.value : null;
	});
	const counts = $derived(facts === null || facts === 'failed' ? facts : facts.counts);
	const tree = $derived(buildGroupTree(loaded && loaded !== 'failed' ? loaded.groupCatalog : []));
	const shown = $derived(
		loaded && loaded !== 'failed' && facts && facts !== 'failed'
			? filterTaskings(loaded.taskings, filters, today, tree, facts.taskings)
			: []
	);
	const filtered = $derived(
		JSON.stringify({ ...filters, view: DEFAULT_TASKING_FILTERS.view }) !== JSON.stringify(DEFAULT_TASKING_FILTERS)
	);
	let creating = $state<TaskingChoices | null>(null);
	let creatingEvent = $state<{ members: MemberLabels } | null>(null);
	let createError = $state('');

	const VIEWS: { value: TaskingView; label: string }[] = [
		{ value: 'active', label: 'Active' },
		{ value: 'overdue', label: 'Overdue' },
		{ value: 'blocked', label: 'Blocked' },
		{ value: 'needs_people', label: 'Needs people' },
		{ value: 'completed', label: 'Completed' },
		{ value: 'cancelled', label: 'Cancelled' }
	];
	const WITHIN: { value: TaskingWithin; label: string }[] = [
		{ value: 'any', label: 'Any' },
		{ value: '7', label: 'Next 7 days' },
		{ value: '14', label: 'Next 14 days' },
		{ value: '30', label: 'Next 30 days' }
	];
	const CHIP_TONE: Record<FactTone, string> = {
		danger: 'bg-destructive/10 text-danger-foreground hover:bg-destructive/15',
		warning: 'bg-accent/12 text-accent-text hover:bg-accent/20',
		success: 'border border-border text-foreground hover:bg-muted',
		plain: 'border border-border text-foreground hover:bg-muted',
		muted: 'border border-border bg-muted text-foreground hover:bg-muted/60'
	};

	const count = (key: keyof TaskingWorkspace['counts']) => (counts === 'failed' ? undefined : (counts?.[key] ?? null));
	const chips = $derived<{ view: TaskingView; label: string; tone: FactTone; count: number | null | undefined }[]>([
		{ view: 'active', label: 'Active', tone: 'plain', count: count('active') },
		{ view: 'overdue', label: 'Overdue', tone: 'danger', count: count('overdue') },
		{ view: 'blocked', label: 'Blocked', tone: 'danger', count: count('blocked') },
		{ view: 'needs_people', label: 'Needs people', tone: 'warning', count: count('needsPeople') },
		{ view: 'completed', label: 'Completed', tone: 'muted', count: count('completed') }
	]);

	const eventOptions = $derived.by<ToolbarOption[]>(() => {
		const events = Object.fromEntries(
			(loaded && loaded !== 'failed' ? loaded.taskings : []).flatMap((tasking) =>
				tasking.event ? [[tasking.event.id, { label: tasking.event.title, startsOn: tasking.event.startsOn }]] : []
			)
		);
		if (!['all', 'standalone'].includes(filters.event) && !(filters.event in events))
			events[filters.event] = { label: 'Another event', startsOn: '' };
		return [
			{ value: 'all', label: 'All' },
			{ value: 'standalone', label: 'Standalone' },
			...Object.entries(events)
				.sort(([, a], [, b]) => a.startsOn.localeCompare(b.startsOn) || a.label.localeCompare(b.label))
				.map(([value, { label }]) => ({ value, label }))
		];
	});
	const responsibilityOptions = $derived<ToolbarOption[]>([
		{ value: 'all', label: 'All' },
		{ value: 'organization', label: org.orgName },
		...tree.roots.map((root) => ({ value: root.id, label: root.name }))
	]);
	const responsible = $derived(
		loaded === null || responsibilityOptions.some((option) => option.value === filters.responsibility)
			? filters.responsibility
			: 'all'
	);

	const viewHref = (view: TaskingView) => `${taskingsHref}${taskingFiltersQuery({ ...filters, view })}`;

	function show(next: Partial<TaskingFilters>, replaceState = false) {
		void goto(`${taskingsHref}${taskingFiltersQuery({ ...filters, ...next })}`, {
			keepFocus: true,
			noScroll: true,
			replaceState
		});
	}

	const toolbarItems = $derived<ToolbarItem[]>([
		{
			kind: 'select',
			id: 'event',
			label: 'Event',
			options: eventOptions,
			value: filters.event,
			defaultValue: 'all',
			showLabel: true,
			onValueChange: (event) => show({ event })
		},
		{
			kind: 'select',
			id: 'responsibility',
			label: 'Responsible',
			options: responsibilityOptions,
			value: responsible,
			defaultValue: 'all',
			showLabel: true,
			onValueChange: (responsibility) => show({ responsibility })
		},
		{
			kind: 'select',
			id: 'status',
			label: 'Status',
			options: VIEWS,
			value: filters.view,
			defaultValue: 'active',
			showLabel: true,
			onValueChange: (value) => show({ view: VIEWS.find((view) => view.value === value)?.value ?? 'active' })
		},
		{
			kind: 'select',
			id: 'within',
			label: 'Due',
			options: WITHIN,
			value: filters.within,
			defaultValue: 'any',
			showLabel: true,
			onValueChange: (within) => show({ within: WITHIN.find((option) => option.value === within)?.value ?? 'any' })
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

	async function startCreateEvent() {
		createError = '';
		const requested = eventMembers;
		const result = await requested;
		if (requested !== eventMembers) return;
		if (result.status === 'loaded' && result.value) creatingEvent = { members: result.value };
		else createError = 'The members to choose a coordinator from could not be loaded. Try again in a moment.';
	}

	function created(tasking: Tasking) {
		creating = null;
		void goto(`${taskingsHref}/${tasking.id}`);
	}

	function createdEvent(event: CalendarEvent, next?: 'add-tasking') {
		creatingEvent = null;
		void goto(`${eventsHref}/${event.id}${next === 'add-tasking' ? '?addTasking=1' : ''}`);
	}

	function clearFilters() {
		show({ ...DEFAULT_TASKING_FILTERS, view: filters.view });
	}
</script>

{#snippet actions()}
	{#if canCreateEvent || canCreate}
		<div class="flex flex-wrap items-center gap-2">
			{#if canCreateEvent}
				<Button variant="outline" onclick={startCreateEvent}>Create event</Button>
			{/if}
			{#if canCreate}
				<Button onclick={startCreate}><Plus data-icon="inline-start" aria-hidden="true" />Create tasking</Button>
			{/if}
		</div>
	{/if}
{/snippet}

{#snippet strip()}
	<div class="min-w-0 grow">
		<WorkspaceToolbar
			ariaLabel="Tasking filters"
			bare
			items={toolbarItems}
			compactBelow="sm"
			search={{
				label: 'Search taskings',
				placeholder: 'Search taskings',
				value: filters.search,
				onValueChange: (search) => show({ search }, true)
			}}
		/>
	</div>
{/snippet}

<PageShell.Root width="wide">
	<EventsTaskingsHeader
		orgUrlSegment={org.orgUrlSegment}
		section="taskings"
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

	<div class="grid gap-4">
		<div class="flex flex-wrap items-center gap-2">
			<nav class="flex flex-wrap items-center gap-2" aria-label="Taskings by state">
				{#each chips as chip (chip.view)}
					{@const current = filters.view === chip.view}
					<a
						href={viewHref(chip.view)}
						data-sveltekit-keepfocus
						data-sveltekit-noscroll
						aria-current={current ? 'page' : undefined}
						class={[
							'inline-flex h-[30px] items-center gap-2 rounded-full px-3 text-[13px] font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
							current ? 'bg-foreground text-background' : CHIP_TONE[chip.tone]
						]}
					>
						{chip.label}
						{#if chip.count === null}
							<Skeleton class="h-3 w-[2ch]" aria-hidden="true" />
						{:else if chip.count !== undefined}
							<span class="min-w-[1ch] font-mono text-xs font-semibold tabular-nums">
								{chip.count}
							</span>
						{/if}
					</a>
				{/each}
			</nav>
			<span class="ml-auto font-mono text-xs text-muted-foreground">
				{scopeOfView(filters.view) === 'active' ? 'Sorted by next date' : 'Newest first'}
			</span>
		</div>

		{#if loaded === null}
			<div class="overflow-hidden rounded-lg border border-border" role="status" aria-label="Loading taskings">
				<div class="h-9 border-b border-border bg-muted"></div>
				{#each [0, 1, 2, 3, 4] as placeholder (placeholder)}
					<div class="flex h-[54px] items-center gap-3 border-b border-border px-3.5 last:border-b-0">
						<Skeleton class="h-5 w-20 shrink-0" />
						<div class="grid min-w-0 grow gap-1">
							<Skeleton class="h-4 w-2/3" />
							<Skeleton class="h-3 w-1/3" />
						</div>
						<Skeleton class="hidden h-4 w-28 shrink-0 sm:block" />
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
			<TaskingsTable
				{taskingsHref}
				{today}
				taskings={shown}
				groups={loaded.groups}
				facts={facts && facts !== 'failed' ? facts.taskings : {}}
			/>
			{#if scopeOfView(filters.view) !== 'active' && loaded.taskings.length >= CLOSED_TASKING_LIMIT}
				<p class="text-sm text-muted-foreground">Showing the {CLOSED_TASKING_LIMIT} most recent.</p>
			{/if}
		{/if}
	</div>
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

{#if creatingEvent}
	<EventDialog
		orgId={org.orgId}
		orgName={org.orgName}
		members={creatingEvent.members}
		currentUserId={org.userId}
		offerTasking={canCreate}
		onSaved={createdEvent}
		onClose={() => (creatingEvent = null)}
	/>
{/if}
