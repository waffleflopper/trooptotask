<script lang="ts">
	import { untrack } from 'svelte';
	import * as Alert from '$lib/components/ui/alert';
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import { Spinner } from '$lib/components/ui/spinner';
	import { formatDisplayDateTime } from '$lib/utils/dates';
	import type { MemberLabels } from '../../events/eventModel';
	import { memberLabel } from '../../events/components/eventLabels';
	import {
		CHECKLIST_LABEL_MAX,
		TASKING_LIST_LIMIT,
		checklistChangeSchema,
		checklistCreateSchema,
		checklistProgress,
		movedIds,
		type ChecklistItem
	} from '../taskingListsModel';
	import {
		addChecklistItemRequest,
		changeChecklistItemRequest,
		removeChecklistItemRequest,
		reorderListRequest
	} from '../taskingListsRequests';
	import ListItemActions from './ListItemActions.svelte';
	import { ListWrites } from './listWrites.svelte';
	import { checklistSummary } from './taskingLabels';

	interface Props {
		orgId: string;
		taskingId: string;
		items: ChecklistItem[];
		members: MemberLabels;
		canEdit: boolean;
		onChanged: () => void;
	}

	let { orgId, taskingId, items: loaded, members, canEdit, onChanged }: Props = $props();

	const writes = new ListWrites();
	let items = $state.raw(untrack(() => loaded));
	let addId = crypto.randomUUID();
	let label = $state('');
	let triedAdd = $state(false);
	let editing = $state<{ id: string; label: string } | null>(null);
	let triedEdit = $state(false);

	$effect(() => () => writes.stop());
	// A refreshed load replaces what is shown only while no write of ours is still on its way.
	$effect(() => {
		const next = loaded;
		untrack(() => {
			if (!writes.saving.pending) items = next;
		});
	});

	const progress = $derived(checklistProgress(items));
	const full = $derived(items.length >= TASKING_LIST_LIMIT);
	const addParsed = $derived(checklistCreateSchema.safeParse({ id: addId, label }));
	const editParsed = $derived(editing ? checklistChangeSchema.safeParse({ label: editing.label }) : null);

	const labelProblem = (parsed: { success: boolean; error?: { issues: { message: string }[] } } | null) =>
		parsed && !parsed.success ? parsed.error?.issues[0]?.message : undefined;

	function put(item: ChecklistItem) {
		items = items.some((existing) => existing.id === item.id)
			? items.map((existing) => (existing.id === item.id ? item : existing))
			: [...items, item];
	}

	function add() {
		triedAdd = true;
		if (!addParsed.success) return;
		const { id, label: text } = addParsed.data;
		void writes.run(
			() => addChecklistItemRequest(orgId, taskingId, id, text),
			(item) => {
				put(item);
				addId = crypto.randomUUID();
				label = '';
				triedAdd = false;
				onChanged();
			},
			'The item was not added. Your entry is kept, so try again.'
		);
	}

	function change(item: ChecklistItem, patch: { label?: string; done?: boolean }, done?: () => void) {
		void writes.run(
			() => changeChecklistItemRequest(orgId, taskingId, item.id, patch),
			(saved) => {
				put(saved);
				done?.();
				onChanged();
			},
			'The item did not change. Try again.'
		);
	}

	function saveEdit(item: ChecklistItem) {
		triedEdit = true;
		if (!editParsed?.success || editParsed.data.label === undefined) return;
		const text = editParsed.data.label;
		if (text === item.label) editing = null;
		else change(item, { label: text }, () => (editing = null));
	}

	function remove(item: ChecklistItem) {
		void writes.run(
			() => removeChecklistItemRequest(orgId, taskingId, item.id),
			() => {
				items = items.filter((existing) => existing.id !== item.id);
				onChanged();
			},
			'The item was not removed. Try again.'
		);
	}

	function move(item: ChecklistItem, step: -1 | 1) {
		const ids = movedIds(
			items.map((existing) => existing.id),
			item.id,
			step
		);
		if (!ids) return;
		void writes.run(
			() => reorderListRequest(orgId, taskingId, 'checklist', ids),
			(lists) => {
				items = lists.checklist;
				onChanged();
			},
			'The order did not change. Try again.'
		);
	}
</script>

<section class="grid gap-3" aria-labelledby="tasking-checklist-heading">
	<div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
		<h2 id="tasking-checklist-heading" class="font-heading text-lg font-semibold">Checklist</h2>
		<p class="m-0 text-sm text-muted-foreground" aria-live="polite">
			{progress ? checklistSummary(progress) : 'No items'}
		</p>
	</div>

	{#if writes.error}
		<Alert.Root variant="destructive">
			<Alert.Description>{writes.error}</Alert.Description>
		</Alert.Root>
	{/if}

	{#if items.length > 0}
		<ul class="m-0 grid list-none divide-y rounded-lg border p-0">
			{#each items as item, index (item.id)}
				<li class="p-3">
					{#if editing?.id === item.id}
						<form
							class="grid gap-3"
							novalidate
							onsubmit={(submit) => {
								submit.preventDefault();
								saveEdit(item);
							}}
						>
							<Field.Root>
								<Field.Label for={`checklist-label-${item.id}`}>Checklist item</Field.Label>
								<Input
									id={`checklist-label-${item.id}`}
									autocomplete="off"
									maxlength={CHECKLIST_LABEL_MAX * 2}
									bind:value={editing.label}
								/>
								{#if triedEdit && labelProblem(editParsed)}<Field.Error>{labelProblem(editParsed)}</Field.Error>{/if}
							</Field.Root>
							<div class="flex flex-wrap gap-2">
								<Button type="submit" size="sm" disabled={writes.saving.pending}>
									{#if writes.saving.pending}<Spinner />{/if}
									Save
								</Button>
								<Button
									variant="outline"
									size="sm"
									disabled={writes.saving.pending}
									onclick={() => {
										editing = null;
									}}>Cancel</Button
								>
							</div>
						</form>
					{:else}
						<div class="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-3">
							<div class="flex min-w-0 items-start gap-3">
								<Checkbox
									class="mt-0.5"
									aria-labelledby={`checklist-text-${item.id}`}
									disabled={!canEdit || writes.saving.pending}
									bind:checked={() => item.done, (done) => change(item, { done })}
								/>
								<div class="grid min-w-0 gap-0.5">
									<span
										id={`checklist-text-${item.id}`}
										class={['wrap-anywhere', item.done && 'text-muted-foreground line-through']}
									>
										{item.label}
									</span>
									{#if item.done && item.doneAt}
										<span class="font-mono text-xs text-muted-foreground">
											Done by {memberLabel(item.doneBy, members)} · {formatDisplayDateTime(item.doneAt)}
										</span>
									{/if}
								</div>
							</div>
							{#if canEdit}
								<ListItemActions
									name={item.label}
									first={index === 0}
									last={index === items.length - 1}
									disabled={writes.saving.pending}
									onMove={(step) => move(item, step)}
									onEdit={() => {
										triedEdit = false;
										editing = { id: item.id, label: item.label };
									}}
									onRemove={() => remove(item)}
								/>
							{/if}
						</div>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}

	{#if canEdit}
		<form
			class="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start"
			novalidate
			onsubmit={(submit) => {
				submit.preventDefault();
				add();
			}}
		>
			<Field.Root>
				<Field.Label for="checklist-add-label">Add checklist item</Field.Label>
				<Input
					id="checklist-add-label"
					autocomplete="off"
					placeholder="e.g., Confirm the range is booked"
					disabled={full}
					bind:value={label}
				/>
				{#if triedAdd && labelProblem(addParsed)}<Field.Error>{labelProblem(addParsed)}</Field.Error>{/if}
			</Field.Root>
			<div class="sm:pt-[1.625rem]">
				<Button
					type="submit"
					variant="outline"
					class="w-full sm:w-auto"
					aria-label="Add to checklist"
					disabled={writes.saving.pending || full}
				>
					{#if writes.saving.pending}<Spinner />{/if}
					Add
				</Button>
			</div>
		</form>
	{/if}
</section>
