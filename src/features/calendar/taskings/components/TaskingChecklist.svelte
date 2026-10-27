<script lang="ts">
	import Plus from '@lucide/svelte/icons/plus';
	import { untrack } from 'svelte';
	import * as Alert from '$lib/components/ui/alert';
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import { Spinner } from '$lib/components/ui/spinner';
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

	interface Props {
		orgId: string;
		taskingId: string;
		items: ChecklistItem[];
		canEdit: boolean;
		onChanged: () => void;
	}

	let { orgId, taskingId, items: loaded, canEdit, onChanged }: Props = $props();

	const writes = new ListWrites();
	let items = $state.raw(untrack(() => loaded));
	let addId = crypto.randomUUID();
	let label = $state('');
	let addOpen = $state(false);
	let triedAdd = $state(false);
	let editing = $state<{ id: string; label: string } | null>(null);
	let triedEdit = $state(false);

	$effect(() => () => writes.stop());
	$effect(() => {
		if (!canEdit) editing = null;
	});
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
		const [id, text] = [addId, addParsed.data.label];
		const submitted = label;
		void writes.run(
			() => addChecklistItemRequest(orgId, taskingId, id, text),
			(item) => {
				put(item);
				addId = crypto.randomUUID();
				if (label === submitted) {
					label = '';
					triedAdd = false;
					addOpen = false;
				}
				onChanged();
			},
			'The item was not added. Your entry is kept, so try again.',
			reseed
		);
	}

	const reseed = () => (items = loaded);

	function change(item: ChecklistItem, patch: { label?: string; done?: boolean }, done?: () => void) {
		void writes.run(
			() => changeChecklistItemRequest(orgId, taskingId, item.id, patch),
			(saved) => {
				put(saved);
				done?.();
				onChanged();
			},
			'The item did not change. Try again.',
			reseed
		);
	}

	function saveEdit(item: ChecklistItem) {
		triedEdit = true;
		if (!editParsed?.success || editParsed.data.label === undefined) return;
		const text = editParsed.data.label;
		if (text === item.label) editing = null;
		else {
			const submitted = editing?.label;
			change(item, { label: text }, () => {
				if (editing?.label === submitted) editing = null;
			});
		}
	}

	function remove(item: ChecklistItem) {
		void writes.run(
			() => removeChecklistItemRequest(orgId, taskingId, item.id),
			() => {
				items = items.filter((existing) => existing.id !== item.id);
				onChanged();
			},
			'The item was not removed. Try again.',
			reseed
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
			'The order did not change. Try again.',
			reseed
		);
	}
</script>

<section
	class="grid min-w-0 content-start gap-[10px] rounded-lg border border-border bg-card px-4 py-[14px]"
	aria-labelledby="tasking-checklist-heading"
>
	<div class="flex flex-wrap items-baseline gap-x-2.5">
		<h2 id="tasking-checklist-heading" class="font-heading text-xl leading-6 font-semibold">Checklist</h2>
		<span
			class={[
				'font-mono text-[13px] tabular-nums',
				progress && progress.done === progress.total ? 'font-semibold text-success-foreground' : 'text-muted-foreground'
			]}
			aria-live="polite"
		>
			{progress ? `${progress.done} of ${progress.total}` : 'No items'}
		</span>
	</div>

	{#if writes.error}
		<Alert.Root variant="destructive">
			<Alert.Description>{writes.error}</Alert.Description>
		</Alert.Root>
	{/if}

	{#if items.length > 0}
		<ul class="m-0 grid list-none gap-1.5 p-0">
			{#each items as item, index (item.id)}
				{@const checkId = `checklist-check-${item.id}`}
				<li class="min-h-7">
					{#if canEdit && editing?.id === item.id}
						<form
							class="grid gap-3 py-1"
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
								<Button variant="outline" size="sm" disabled={writes.saving.pending} onclick={() => (editing = null)}>
									Cancel
								</Button>
							</div>
						</form>
					{:else}
						<div class="flex min-h-7 items-center gap-[10px]">
							<Checkbox
								id={checkId}
								class={canEdit ? undefined : 'disabled:cursor-default disabled:opacity-100'}
								disabled={!canEdit || writes.saving.pending}
								bind:checked={() => item.done, (done) => change(item, { done })}
							/>
							<label
								for={checkId}
								class={['min-w-0 flex-1 text-sm wrap-anywhere', item.done && 'text-muted-foreground line-through']}
							>
								{item.label}
							</label>
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
	{:else if !canEdit}
		<p class="m-0 text-[13px] text-muted-foreground">Nothing to check off.</p>
	{/if}

	{#if canEdit && addOpen}
		<form
			class="grid gap-3 border-t border-border pt-3"
			novalidate
			onsubmit={(submit) => {
				submit.preventDefault();
				add();
			}}
		>
			<Field.Root>
				<Field.Label for="checklist-add-label">Checklist item</Field.Label>
				<Input
					id="checklist-add-label"
					autocomplete="off"
					placeholder="e.g., Confirm the range is booked"
					disabled={full}
					bind:value={label}
				/>
				{#if triedAdd && labelProblem(addParsed)}<Field.Error>{labelProblem(addParsed)}</Field.Error>{/if}
			</Field.Root>
			<div class="flex flex-wrap gap-2">
				<Button type="submit" size="sm" aria-label="Add to checklist" disabled={writes.saving.pending || full}>
					{#if writes.saving.pending}<Spinner />{/if}
					Add
				</Button>
				<Button variant="outline" size="sm" disabled={writes.saving.pending} onclick={() => (addOpen = false)}>
					Cancel
				</Button>
			</div>
		</form>
	{:else if canEdit && !full}
		<Button
			variant="ghost"
			size="sm"
			class="-ml-2 justify-self-start text-muted-foreground"
			onclick={() => (addOpen = true)}
		>
			<Plus data-icon="inline-start" aria-hidden="true" />Add item
		</Button>
	{/if}
</section>
