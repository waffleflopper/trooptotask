<script lang="ts">
	import Ellipsis from '@lucide/svelte/icons/ellipsis';
	import type { StatusType } from '$features/calendar/contracts';
	import { availabilityStore } from '$features/calendar/stores/availability.svelte';
	import { statusTypesStore } from '$features/calendar/stores/statusTypes.svelte';
	import { movedTo } from '$features/calendar/utils/calendarLanes';
	import { oneDayLabel } from '$features/calendar/utils/oneDayLabel';
	import StatusBar from './calendar-bars/StatusBar.svelte';
	import StatusTypeComposer from './StatusTypeComposer.svelte';
	import { ReorderGrip, ReorderItem, ReorderList } from '$lib/components/patterns/reorder-list';
	import { Button } from '$lib/components/ui/button';
	import { ConfirmDialog } from '$lib/components/ui/confirm-dialog';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { toastStore } from '$lib/stores/toast.svelte';

	type Props = {
		canMutate: boolean;
		searchQuery: string;
	};

	type ComposerTarget = { kind: 'create' } | { kind: 'edit'; id: string };

	let { canMutate, searchQuery }: Props = $props();

	let composer = $state<ComposerTarget | null>(null);
	let composerView = $state<StatusTypeComposer>();
	let replacement = $state<ComposerTarget | null>(null);
	let confirmDelete = $state<StatusType | null>(null);

	const items = $derived(statusTypesStore.items);
	// A save in flight shows the order being saved; a type it does not name still shows, last.
	const statuses = $derived.by(() => {
		const pending = statusTypesStore.pendingOrder;
		if (!pending) return items;
		const byId = new Map(items.map((status) => [status.id, status]));
		return [...pending.flatMap((id) => byId.get(id) ?? []), ...items.filter((status) => !pending.includes(status.id))];
	});
	const statusIds = $derived(statuses.map((status) => status.id));
	const query = $derived(searchQuery.trim().toLowerCase());
	const visibleStatuses = $derived(statuses.filter((status) => !query || status.name.toLowerCase().includes(query)));

	export function openAddDialog() {
		if (!canMutate) return;
		openComposer({ kind: 'create' });
	}

	function openComposer(target: ComposerTarget) {
		if (composerView?.isDirty()) replacement = target;
		else composer = target;
	}

	function editing(status: StatusType) {
		return composer?.kind === 'edit' && composer.id === status.id;
	}

	async function deleteStatus(status: StatusType) {
		try {
			if (!(await statusTypesStore.remove(status.id))) {
				toastStore.error('Failed to delete status type');
				return;
			}
		} catch (error) {
			toastStore.error(error instanceof Error ? error.message : 'Failed to delete status type');
			return;
		}
		if (editing(status)) composer = null;
		try {
			availabilityStore.removeByStatusTypeLocal(status.id);
		} catch (error) {
			toastStore.error(
				error instanceof Error ? error.message : 'Status type deleted, but local calendar cleanup failed'
			);
		}
		confirmDelete = null;
	}
</script>

<div class="flex flex-col gap-6">
	{#if composer?.kind === 'create'}
		<StatusTypeComposer bind:this={composerView} onClose={() => (composer = null)} />
	{/if}

	<section class="flex flex-col gap-2" aria-labelledby="status-types-heading">
		<div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
			<h4 id="status-types-heading" class="font-mono text-xs font-semibold tracking-widest uppercase">
				{statuses.length}
				{statuses.length === 1 ? 'status type' : 'status types'}
			</h4>
			{#if canMutate}
				<p class="text-sm text-muted-foreground">
					{query ? 'Clear search to reorder.' : 'Drag to set legend and picker order.'}
				</p>
			{/if}
		</div>
		{#if visibleStatuses.length > 0}
			<ReorderList
				entries={statuses.map((status) => ({ id: status.id, label: status.name }))}
				onmove={(id, toIndex) => statusTypesStore.setOrder(movedTo(statusIds, id, toIndex))}
				aria-labelledby="status-types-heading"
				class="divide-y rounded-md border"
			>
				{#each visibleStatuses as status (status.id)}
					<ReorderItem id={status.id} class="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
						{#if editing(status)}
							<StatusTypeComposer bind:this={composerView} {status} onClose={() => (composer = null)} />
						{:else}
							{#if query || !canMutate}
								<span class="size-6 shrink-0"></span>
							{:else}
								<ReorderGrip />
							{/if}
							<StatusBar
								class="flex-1 basis-40 sm:w-60 sm:flex-none"
								{status}
								label={{ kind: 'name', text: status.name }}
								aria-hidden="true"
							/>
							<div class="flex min-w-32 flex-1 flex-col">
								<span class="truncate text-sm font-medium">{status.name}</span>
								<span class="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
									One-day label · {oneDayLabel(status)}
								</span>
							</div>
							<div class="ml-auto flex shrink-0 items-center gap-3">
								<StatusBar
									class="h-6"
									{status}
									label={{ kind: 'one-day', text: oneDayLabel(status) }}
									aria-hidden="true"
								/>
								{#if canMutate}
									<DropdownMenu.Root>
										<DropdownMenu.Trigger>
											{#snippet child({ props })}
												<Button {...props} size="icon-sm" variant="ghost" aria-label="More actions for {status.name}">
													<Ellipsis />
												</Button>
											{/snippet}
										</DropdownMenu.Trigger>
										<DropdownMenu.Content align="end">
											<DropdownMenu.Item onSelect={() => openComposer({ kind: 'edit', id: status.id })}
												>Edit</DropdownMenu.Item
											>
											<DropdownMenu.Item
												variant="destructive"
												disabled={statusTypesStore.orderBusy}
												onSelect={() => (confirmDelete = status)}>Delete</DropdownMenu.Item
											>
										</DropdownMenu.Content>
									</DropdownMenu.Root>
								{/if}
							</div>
						{/if}
					</ReorderItem>
				{/each}
			</ReorderList>
		{:else}
			<p class="rounded-md border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
				No status types found
			</p>
		{/if}
	</section>
</div>

{#if replacement}
	<ConfirmDialog
		title="Discard changes?"
		message="Your changes to this status type are not saved."
		confirmLabel="Discard"
		onConfirm={() => {
			composer = replacement;
			replacement = null;
		}}
		onCancel={() => (replacement = null)}
	/>
{/if}

{#if confirmDelete}
	<ConfirmDialog
		title="Delete Status Type"
		message={`Remove "${confirmDelete.name}"? All schedule entries using this status will also be removed. This cannot be undone.`}
		confirmLabel="Delete"
		onConfirm={() => {
			if (confirmDelete) return deleteStatus(confirmDelete);
		}}
		onCancel={() => (confirmDelete = null)}
	/>
{/if}
