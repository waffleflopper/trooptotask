<script lang="ts">
	import Ellipsis from '@lucide/svelte/icons/ellipsis';
	import { rosterStore } from '$features/personnel';
	import type { AssignmentType } from '$features/calendar/contracts';
	import { dailyAssignmentsStore } from '$features/calendar/stores/dailyAssignments.svelte';
	import { calendarLaneIds, movedTo } from '$features/calendar/utils/calendarLanes';
	import AssignmentCodeChip from './AssignmentCodeChip.svelte';
	import AssignmentTypeDialog from './AssignmentTypeDialog.svelte';
	import { ReorderGrip, ReorderItem, ReorderList } from '$lib/components/patterns/reorder-list';
	import { Button } from '$lib/components/ui/button';
	import { ConfirmDialog } from '$lib/components/ui/confirm-dialog';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Switch } from '$lib/components/ui/switch';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { rejectedRequestMessage } from '$lib/stores/core';

	type Props = {
		canMutate: boolean;
		searchQuery: string;
	};

	let { canMutate, searchQuery }: Props = $props();

	let editor = $state<{ type?: AssignmentType } | null>(null);
	let confirmDelete = $state<AssignmentType | null>(null);

	const types = $derived(dailyAssignmentsStore.types);
	const laneIds = $derived(dailyAssignmentsStore.pendingLaneIds ?? calendarLaneIds(types));
	const lanes = $derived(laneIds.flatMap((id) => types.find((type) => type.id === id) ?? []));
	const plannerOnly = $derived(
		types
			.filter((type) => !type.archivedAt && !laneIds.includes(type.id))
			.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
	);
	const query = $derived(searchQuery.trim().toLowerCase());
	const matches = (type: AssignmentType) => !query || type.name.toLowerCase().includes(query);
	const visibleLanes = $derived(lanes.filter(matches));
	const visiblePlannerOnly = $derived(plannerOnly.filter(matches));
	const noMatches = $derived(Boolean(query) && visibleLanes.length === 0 && visiblePlannerOnly.length === 0);
	// Lane moves fold into one ordered save, so only a details write in progress locks the lane controls.
	const lanesLocked = $derived(!canMutate || dailyAssignmentsStore.typeWritesBusy);
	const roster = $derived(rosterStore.items.filter((person) => !person.archivedAt));

	export function openAddDialog() {
		if (!canMutate) return;
		editor = {};
	}

	function setShown(id: string, shown: boolean) {
		void dailyAssignmentsStore.setCalendarLanes(shown ? [...laneIds, id] : laneIds.filter((laneId) => laneId !== id));
	}

	async function deleteType(type: AssignmentType) {
		try {
			if (!(await dailyAssignmentsStore.removeType(type.id))) {
				toastStore.error('Failed to delete assignment type');
				return;
			}
		} catch (error) {
			toastStore.error(rejectedRequestMessage(error, 'Failed to delete assignment type'));
			return;
		}
		confirmDelete = null;
	}
</script>

{#snippet row(type: AssignmentType, shown: boolean)}
	<AssignmentCodeChip code={type.shortName} color={type.color} size="row" />
	<div class="flex min-w-32 flex-1 flex-col">
		<span class="truncate text-sm font-medium">{type.name}</span>
		<span class="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
			{type.assignTo === 'personnel' ? 'Person' : 'Group'}
		</span>
	</div>
	<!-- On a narrow screen the controls wrap below the name instead of squeezing it. -->
	<div class="ml-auto flex shrink-0 items-center gap-3">
		<label class="flex items-center gap-2 text-sm text-muted-foreground">
			{shown ? 'On calendar' : 'Planner only'}
			<Switch
				checked={shown}
				disabled={lanesLocked}
				aria-label="Show {type.name} on the calendar"
				onCheckedChange={(checked) => setShown(type.id, checked)}
			/>
		</label>
		{#if canMutate}
			<DropdownMenu.Root>
				<DropdownMenu.Trigger>
					{#snippet child({ props })}
						<Button {...props} size="icon-sm" variant="ghost" aria-label="More actions for {type.name}">
							<Ellipsis />
						</Button>
					{/snippet}
				</DropdownMenu.Trigger>
				<DropdownMenu.Content align="end">
					<DropdownMenu.Item disabled={dailyAssignmentsStore.typesBusy} onSelect={() => (editor = { type })}
						>Edit</DropdownMenu.Item
					>
					<DropdownMenu.Item
						variant="destructive"
						disabled={dailyAssignmentsStore.typesBusy}
						onSelect={() => (confirmDelete = type)}>Delete</DropdownMenu.Item
					>
				</DropdownMenu.Content>
			</DropdownMenu.Root>
		{/if}
	</div>
{/snippet}

<div class="flex flex-col gap-6">
	<section class="flex flex-col gap-2" aria-labelledby="calendar-lanes-heading">
		<div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
			<h4 id="calendar-lanes-heading" class="font-mono text-xs font-semibold tracking-widest uppercase">
				On the calendar · {lanes.length}
				{lanes.length === 1 ? 'lane' : 'lanes'}
			</h4>
			<p class="text-sm text-muted-foreground">
				{query ? 'Clear search to reorder.' : 'Drag to reorder. Everyone who can view the calendar sees these lanes.'}
			</p>
		</div>
		{#if visibleLanes.length > 0}
			<ReorderList
				entries={lanes.map((type) => ({ id: type.id, label: type.name }))}
				onmove={(id, toIndex) => dailyAssignmentsStore.setCalendarLanes(movedTo(laneIds, id, toIndex))}
				aria-labelledby="calendar-lanes-heading"
				class="divide-y rounded-md border"
			>
				{#each visibleLanes as type (type.id)}
					<ReorderItem id={type.id} class="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
						{#if query}
							<span class="size-6 shrink-0"></span>
						{:else}
							<ReorderGrip disabled={lanesLocked} />
						{/if}
						{@render row(type, true)}
					</ReorderItem>
				{/each}
			</ReorderList>
		{:else if lanes.length === 0}
			<p class="rounded-md border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
				No lanes. Turn on an assignment type to show it under the dates.
			</p>
		{/if}
		{#if lanes.length > 3}
			<p class="text-sm text-muted-foreground">Each lane adds about 26px above the roster.</p>
		{/if}
	</section>

	<section class="flex flex-col gap-2" aria-labelledby="planner-only-heading">
		<div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
			<h4 id="planner-only-heading" class="font-mono text-xs font-semibold tracking-widest uppercase">
				Duty planner only
			</h4>
			<p class="text-sm text-muted-foreground">Still assigned and reported. Hidden from the calendar.</p>
		</div>
		{#if visiblePlannerOnly.length > 0}
			<ul class="divide-y rounded-md border" aria-labelledby="planner-only-heading">
				{#each visiblePlannerOnly as type (type.id)}
					<li class="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
						<span class="size-6 shrink-0"></span>
						{@render row(type, false)}
					</li>
				{/each}
			</ul>
		{:else if plannerOnly.length === 0}
			<p class="rounded-md border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
				Every assignment type is on the calendar.
			</p>
		{/if}
	</section>
	{#if noMatches}
		<p class="text-center text-sm text-muted-foreground">No assignment types found</p>
	{/if}
</div>

{#if editor}
	<AssignmentTypeDialog type={editor.type} {roster} onClose={() => (editor = null)} />
{/if}

{#if confirmDelete}
	<ConfirmDialog
		title="Delete Assignment Type"
		message={`Remove "${confirmDelete.name}"? All assignments using this type will also be removed. This cannot be undone.`}
		confirmLabel="Delete"
		onConfirm={() => {
			if (confirmDelete) return deleteType(confirmDelete);
		}}
		onCancel={() => (confirmDelete = null)}
	/>
{/if}
