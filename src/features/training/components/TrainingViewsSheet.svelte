<script lang="ts">
	import { onDestroy, tick } from 'svelte';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import Plus from '@lucide/svelte/icons/plus';
	import * as Alert from '$lib/components/ui/alert';
	import * as AppDialog from '$lib/components/ui/app-dialog';
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { ConfirmDialog } from '$lib/components/ui/confirm-dialog';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { ReorderGrip, ReorderItem, ReorderList } from '$lib/components/patterns/reorder-list';
	import { rejectedRequestMessage } from '$lib/stores/core';
	import { PendingSave } from '$lib/utils/pendingSave.svelte';
	import { trainingTypesStore } from '$features/training/stores/trainingTypes.svelte';
	import { trainingViewsStore } from '$features/training/stores/trainingViews.svelte';
	import type { TrainingType, TrainingView } from '$features/training/training.types';
	import { getColumnIntervalLabel } from '../utils/cellDisplayText';
	import { filterColumnsByView } from '../utils/viewFiltering';

	let {
		orgId,
		canMutate,
		saveView,
		deleteView,
		returnFocusTo,
		onClose
	}: {
		orgId: string;
		canMutate: boolean;
		saveView: (draft: { id: string | null; name: string; columnIds: string[] }) => Promise<TrainingView | 'stale'>;
		deleteView: (id: string) => Promise<'deleted' | 'failed' | 'stale'>;
		/** The control that opened the sheet, which gets focus back when it closes. */
		returnFocusTo?: () => HTMLElement | null;
		onClose: () => void;
	} = $props();

	/** An editor draft belongs to one view, or to a new one when `viewId` is null. `columnIds` is the checked list in order. */
	type Editor = {
		viewId: string | null;
		heading: string;
		initialName: string;
		initialColumnIds: string[];
		name: string;
		columnIds: string[];
	};

	let editor = $state<Editor | null>(null);
	let nameRequired = $state(false);
	let saveError = $state('');
	let confirmingDelete = $state(false);
	let deleteError = $state('');
	let nameInput = $state<HTMLInputElement | null>(null);
	let listRoot = $state<HTMLElement | null>(null);
	const saving = new PendingSave();
	const deleting = new PendingSave();
	let mounted = true;
	onDestroy(() => (mounted = false));

	const ready = $derived(
		trainingViewsStore.orgId === orgId &&
			trainingTypesStore.orgId === orgId &&
			!trainingViewsStore.loading &&
			!trainingTypesStore.loading
	);
	const types = $derived(filterColumnsByView(trainingTypesStore.items, null));
	const typeById = $derived(new Map(types.map((type) => [type.id, type])));
	const views = $derived([...trainingViewsStore.items].sort((a, b) => a.name.localeCompare(b.name)));
	const checked = $derived(
		editor ? editor.columnIds.flatMap((id) => (typeById.has(id) ? [typeById.get(id) as TrainingType] : [])) : []
	);
	const unchecked = $derived(editor ? types.filter((type) => !editor!.columnIds.includes(type.id)) : []);
	const dirty = $derived(
		editor !== null &&
			(editor.name !== editor.initialName ||
				editor.columnIds.length !== editor.initialColumnIds.length ||
				editor.columnIds.some((id, index) => id !== editor!.initialColumnIds[index]))
	);
	const busy = $derived(saving.pending || deleting.pending);

	function knownColumnIds(view: TrainingView): string[] {
		return view.columnIds.filter((id) => typeById.has(id));
	}

	function viewSummary(view: TrainingView): string {
		const count = knownColumnIds(view).length;
		return count === 0 ? 'No columns selected' : `${count} of ${types.length} columns`;
	}

	async function openEditor(view: TrainingView | null) {
		if (!canMutate || busy) return;
		const columnIds = view ? knownColumnIds(view) : [];
		editor = {
			viewId: view?.id ?? null,
			heading: view?.name ?? 'New view',
			initialName: view?.name ?? '',
			initialColumnIds: columnIds,
			name: view?.name ?? '',
			columnIds: [...columnIds]
		};
		nameRequired = false;
		saveError = '';
		await tick();
		nameInput?.focus();
	}

	async function leaveEditor(focusViewId: string | null) {
		editor = null;
		await tick();
		const row = focusViewId
			? listRoot?.querySelector<HTMLElement>(`[data-view-id="${CSS.escape(focusViewId)}"]`)
			: null;
		(row ?? listRoot?.querySelector<HTMLElement>('[data-new-view]'))?.focus();
	}

	async function toggleColumn(id: string) {
		if (!editor) return;
		editor.columnIds = editor.columnIds.includes(id)
			? editor.columnIds.filter((columnId) => columnId !== id)
			: [...editor.columnIds, id];
		await tick();
		document.getElementById(`view-type-${id}`)?.focus();
	}

	function moveColumn(id: string, toIndex: number) {
		if (!editor) return;
		const next = editor.columnIds.filter((columnId) => columnId !== id);
		next.splice(toIndex, 0, id);
		editor.columnIds = next;
	}

	async function save() {
		if (!editor || !canMutate) return;
		const draft = editor;
		const name = draft.name.trim();
		if (!name) {
			nameRequired = true;
			nameInput?.focus();
			return;
		}
		saveError = '';
		const isCurrent = () => mounted && editor === draft;
		try {
			const result = await saveView({ id: draft.viewId, name, columnIds: $state.snapshot(draft.columnIds) });
			if (result === 'stale' || !isCurrent()) return;
			await leaveEditor(result.id);
		} catch (failure) {
			if (isCurrent()) saveError = rejectedRequestMessage(failure, 'Failed to save view.');
		}
	}

	async function confirmDelete() {
		const draft = editor;
		if (!draft?.viewId) return;
		const id = draft.viewId;
		deleteError = '';
		await deleting.run(async () => {
			let result: 'deleted' | 'failed' | 'stale';
			try {
				result = await deleteView(id);
			} catch {
				result = 'failed';
			}
			if (result === 'stale' || !mounted || editor !== draft) return;
			if (result === 'failed') {
				deleteError = 'Failed to delete view. Try again.';
				return;
			}
			confirmingDelete = false;
			await leaveEditor(null);
		});
	}

	async function close() {
		onClose();
		await tick();
		returnFocusTo?.()?.focus();
	}
</script>

<AppDialog.Root open {busy} closeBlocked={dirty} onClose={close}>
	<AppDialog.Content presentation="sheet">
		<AppDialog.Header class="border-b pb-4">
			{#if editor}
				<p
					class="flex items-center gap-1 font-mono text-[0.6875rem] leading-[14px] font-medium tracking-[0.08em] text-muted-foreground uppercase"
				>
					<button
						type="button"
						class="-ml-1 inline-flex items-center gap-1 rounded-sm px-1 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
						aria-label="Back to all views"
						disabled={busy || dirty}
						onclick={() => leaveEditor(editor?.viewId ?? null)}
					>
						<ChevronLeft class="size-3.5" aria-hidden="true" />
						All views
					</button>
					<span aria-hidden="true">·</span>
					<span>{editor.viewId === null ? 'New view' : 'Edit view'}</span>
				</p>
				<AppDialog.Title>{editor.heading}</AppDialog.Title>
				<AppDialog.Description>
					{checked.length} of {types.length} trainings, in the order shown below
				</AppDialog.Description>
			{:else}
				<p
					class="font-mono text-[0.6875rem] leading-[14px] font-medium tracking-[0.08em] text-muted-foreground uppercase"
				>
					Training
				</p>
				<AppDialog.Title>Manage views</AppDialog.Title>
				<AppDialog.Description>Saved column layouts for the training matrix.</AppDialog.Description>
			{/if}
		</AppDialog.Header>

		{#if !ready}
			<AppDialog.Body class="flex flex-col gap-3 px-7 py-6" aria-busy="true">
				<div role="status" aria-live="polite" aria-label="Loading training views" class="flex flex-col gap-3">
					{#each Array.from({ length: 4 }) as _, index (index)}
						<Skeleton class="h-12 w-full" />
					{/each}
				</div>
			</AppDialog.Body>
		{:else if editor}
			<AppDialog.Body class="flex flex-col gap-7 px-7 py-6">
				<fieldset class="contents" disabled={busy}>
					<Field.Root>
						<Field.Label for="view-name">View name</Field.Label>
						<Input
							id="view-name"
							type="text"
							bind:ref={nameInput}
							bind:value={editor.name}
							placeholder="e.g. Annual trainings"
							aria-invalid={nameRequired && !editor.name.trim() ? true : undefined}
						/>
						{#if nameRequired && !editor.name.trim()}
							<Field.Error>Name is required.</Field.Error>
						{:else if saveError}
							<Field.Error>{saveError}</Field.Error>
						{/if}
					</Field.Root>

					<section aria-labelledby="view-in-heading" class="flex flex-col">
						<div
							class="flex items-baseline justify-between border-b border-foreground pb-2 font-mono text-[0.6875rem] font-medium tracking-[0.08em] text-muted-foreground uppercase"
						>
							<h3 id="view-in-heading">In this view · {checked.length}</h3>
							<span>Left to right</span>
						</div>
						{#if checked.length === 0}
							<p class="py-4 text-sm text-muted-foreground">No trainings yet. Check one below to add it.</p>
						{/if}
						<ReorderList
							entries={checked.map((type) => ({ id: type.id, label: type.name }))}
							onmove={moveColumn}
							aria-label="Trainings in this view"
						>
							{#each checked as type (type.id)}
								<ReorderItem id={type.id} class="flex items-center gap-3 border-b border-border py-2.5">
									<ReorderGrip />
									<Checkbox id="view-type-{type.id}" checked onCheckedChange={() => toggleColumn(type.id)} />
									<Field.Label for="view-type-{type.id}" class="min-w-0 flex-1 truncate text-sm">
										{type.name}
									</Field.Label>
									<span class="font-mono text-[0.6875rem] tracking-[0.08em] text-muted-foreground uppercase">
										{getColumnIntervalLabel(type)}
									</span>
								</ReorderItem>
							{/each}
						</ReorderList>
					</section>

					{#if unchecked.length > 0}
						<section aria-labelledby="view-out-heading" class="flex flex-col">
							<h3
								id="view-out-heading"
								class="border-b border-border pb-2 font-mono text-[0.6875rem] font-medium tracking-[0.08em] text-muted-foreground uppercase"
							>
								Not in this view · {unchecked.length}
							</h3>
							<ul>
								{#each unchecked as type (type.id)}
									<li class="flex items-center gap-3 border-b border-border py-2.5 pl-9">
										<Checkbox id="view-type-{type.id}" checked={false} onCheckedChange={() => toggleColumn(type.id)} />
										<Field.Label for="view-type-{type.id}" class="min-w-0 flex-1 truncate text-sm">
											{type.name}
										</Field.Label>
										<span class="font-mono text-[0.6875rem] tracking-[0.08em] text-muted-foreground uppercase">
											{getColumnIntervalLabel(type)}
										</span>
									</li>
								{/each}
							</ul>
						</section>
					{/if}

					<p class="text-sm text-muted-foreground">
						Check a training to add it to the end of the list. Drag by the handle, or use Alt + ↑ ↓, to change its
						column.
					</p>
				</fieldset>
			</AppDialog.Body>
			<AppDialog.Footer class="items-center border-t px-7 py-4 sm:justify-between">
				{#if editor.viewId !== null}
					<Button
						variant="link"
						size="none"
						class="text-destructive-text underline"
						disabled={busy}
						onclick={() => {
							deleteError = '';
							confirmingDelete = true;
						}}
					>
						Delete view
					</Button>
				{:else}
					<span></span>
				{/if}
				<div class="flex gap-2">
					<Button variant="outline" disabled={busy} onclick={() => leaveEditor(editor?.viewId ?? null)}>Cancel</Button>
					<Button disabled={busy} onclick={() => saving.run(save)}>
						{saving.pending ? 'Saving...' : 'Save view'}
					</Button>
				</div>
			</AppDialog.Footer>
		{:else}
			<AppDialog.Body class="flex flex-col gap-4 px-7 py-6">
				<div bind:this={listRoot} class="flex flex-col gap-4">
					<div class="flex items-center justify-between gap-3">
						<p class="font-mono text-[0.6875rem] font-medium tracking-[0.08em] text-muted-foreground uppercase">
							Saved views · {views.length}
						</p>
						{#if canMutate}
							<Button variant="outline" size="sm" data-new-view onclick={() => openEditor(null)}>
								<Plus aria-hidden="true" />
								New view
							</Button>
						{/if}
					</div>
					{#if views.length === 0}
						<p class="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
							No saved views yet. A saved view picks which trainings the matrix shows and in what order.
						</p>
					{:else}
						<ul class="flex flex-col border-t border-border" aria-label="Saved views">
							{#each views as view (view.id)}
								<li class="border-b border-border">
									<button
										type="button"
										data-view-id={view.id}
										disabled={!canMutate}
										class="flex w-full items-center gap-3 rounded-sm px-1 py-3 text-left hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:pointer-events-none"
										onclick={() => openEditor(view)}
									>
										<span class="min-w-0 flex-1">
											<span class="block truncate text-sm font-semibold text-foreground">{view.name}</span>
											<span class="block text-[13px] text-muted-foreground">{viewSummary(view)}</span>
										</span>
										{#if canMutate}
											<ChevronRight class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
										{/if}
									</button>
								</li>
							{/each}
						</ul>
					{/if}
				</div>
			</AppDialog.Body>
		{/if}
	</AppDialog.Content>
</AppDialog.Root>

{#if confirmingDelete && editor}
	<ConfirmDialog
		title="Delete Saved View"
		message={`Delete "${editor.initialName}"? This only removes the saved layout.`}
		confirmLabel="Delete"
		onConfirm={confirmDelete}
		onCancel={() => (confirmingDelete = false)}
	>
		{#if deleteError}
			<Alert.Root variant="destructive"><Alert.Description>{deleteError}</Alert.Description></Alert.Root>
		{/if}
	</ConfirmDialog>
{/if}
