<script lang="ts">
	import * as AppDialog from '$lib/components/ui/app-dialog';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import * as Empty from '$lib/components/ui/empty';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
	import { trainingViewsStore } from '$features/training/stores/trainingViews.svelte';
	import { trainingTypesStore } from '$features/training/stores/trainingTypes.svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import type { TrainingView } from '$features/training/training.types';

	interface Props {
		onClose: () => void;
		readOnly: boolean;
	}

	let { onClose, readOnly }: Props = $props();

	let mode: 'list' | 'edit' = $state('list');
	let editingView: TrainingView | null = $state(null);
	let confirmDeleteView: TrainingView | null = $state(null);
	let name = $state('');
	let selectedIds = new SvelteSet<string>();
	let orderedIds: string[] = $state([]);
	let saving = $state(false);
	let error = $state('');

	function startCreate() {
		editingView = null;
		name = '';
		selectedIds.clear();
		orderedIds = [];
		error = '';
		mode = 'edit';
	}

	function startEdit(view: TrainingView) {
		editingView = view;
		name = view.name;
		selectedIds.clear();
		for (const id of view.columnIds) selectedIds.add(id);
		orderedIds = [...view.columnIds];
		error = '';
		mode = 'edit';
	}

	function toggleType(typeId: string) {
		if (selectedIds.has(typeId)) {
			selectedIds.delete(typeId);
			orderedIds = orderedIds.filter((id) => id !== typeId);
		} else {
			selectedIds.add(typeId);
			orderedIds = [...orderedIds, typeId];
		}
	}

	function moveUp(index: number) {
		if (index <= 0) return;
		const newOrder = [...orderedIds];
		[newOrder[index - 1], newOrder[index]] = [newOrder[index], newOrder[index - 1]];
		orderedIds = newOrder;
	}

	function moveDown(index: number) {
		if (index >= orderedIds.length - 1) return;
		const newOrder = [...orderedIds];
		[newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]];
		orderedIds = newOrder;
	}

	async function handleSave() {
		if (!name.trim()) {
			error = 'Name is required.';
			return;
		}
		saving = true;
		error = '';

		try {
			if (editingView) {
				await trainingViewsStore.update(editingView.id, {
					name: name.trim(),
					columnIds: orderedIds
				});
			} else {
				await trainingViewsStore.add({
					name: name.trim(),
					columnIds: orderedIds,
					createdBy: '',
					createdAt: '',
					updatedAt: ''
				});
			}
			mode = 'list';
		} catch {
			error = 'Failed to save view.';
		} finally {
			saving = false;
		}
	}

	async function doDelete() {
		if (!confirmDeleteView) return;
		await trainingViewsStore.remove(confirmDeleteView.id);
		confirmDeleteView = null;
	}

	function getTypeName(typeId: string): string {
		return trainingTypesStore.getById(typeId)?.name ?? 'Unknown';
	}
</script>

<AppDialog.Root closeBlocked={saving} {onClose}>
	<AppDialog.Content closeBlocked={saving} size="wide">
		<AppDialog.Header>
			<AppDialog.Title>{mode === 'list' ? 'Manage Views' : editingView ? 'Edit View' : 'New View'}</AppDialog.Title>
			<AppDialog.Description>
				Control which training columns show in the matrix without rebuilding the view each time.
			</AppDialog.Description>
		</AppDialog.Header>

		<AppDialog.Body>
			{#if mode === 'list'}
				<div class="grid gap-4">
					<div
						class="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 sm:flex-row sm:items-start sm:justify-between"
					>
						<div class="grid gap-1">
							<p class="font-mono text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
								Saved Layouts
							</p>
							<p class="text-sm leading-relaxed text-muted-foreground">
								Control which training columns show up in the matrix without rebuilding the view each time.
							</p>
						</div>
						<Badge variant="outline">{trainingViewsStore.items.length} saved</Badge>
					</div>

					<div class="grid gap-3">
						{#each trainingViewsStore.items as view (view.id)}
							<section
								class="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 sm:flex-row sm:items-start sm:justify-between"
							>
								<div class="grid min-w-0 gap-2">
									<h3 class="text-base font-semibold text-foreground">{view.name}</h3>
									<div class="flex min-w-0 flex-wrap items-center gap-2">
										<Badge variant="outline">{view.columnIds.length} columns</Badge>
										<span class="truncate text-xs text-muted-foreground">
											{view.columnIds.map(getTypeName).join(' • ') || 'No columns selected'}
										</span>
									</div>
								</div>
								{#if !readOnly}
									<div class="flex justify-end gap-2">
										<Button variant="outline" size="sm" type="button" onclick={() => startEdit(view)}>Edit</Button>
										<Button variant="destructive" size="sm" type="button" onclick={() => (confirmDeleteView = view)}>
											Delete
										</Button>
									</div>
								{/if}
							</section>
						{:else}
							<Empty.Root>
								<Empty.Header>
									<Empty.Title>No saved views yet.</Empty.Title>
								</Empty.Header>
								{#if !readOnly}
									<Empty.Content>
										<Button type="button" onclick={startCreate}>New View</Button>
									</Empty.Content>
								{/if}
							</Empty.Root>
						{/each}
					</div>
				</div>
			{:else}
				<div class="grid gap-4">
					<Field.Root>
						<Field.Label for="view-name">View Name</Field.Label>
						<Input id="view-name" type="text" bind:value={name} placeholder="e.g. Annual Trainings" />
						{#if error}
							<Field.Error>{error}</Field.Error>
						{/if}
					</Field.Root>

					<section class="grid gap-3 rounded-lg border border-border bg-card p-4">
						<div class="flex items-center justify-between gap-3">
							<h3 class="font-mono text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
								Training Types
							</h3>
							<Badge variant="outline">{orderedIds.length} selected</Badge>
						</div>
						<div class="grid max-h-56 gap-2 overflow-y-auto rounded-lg border border-border bg-background p-3">
							{#each trainingTypesStore.items as type (type.id)}
								<Field.Root orientation="horizontal">
									<Checkbox
										id="view-type-{type.id}"
										checked={selectedIds.has(type.id)}
										onCheckedChange={() => toggleType(type.id)}
									/>
									<Field.Label for="view-type-{type.id}">
										<span class="inline-flex min-w-0 items-center gap-2">
											<span class="size-3 rounded-sm" style:background-color={type.color} aria-hidden="true"></span>
											<span class="truncate">{type.name}</span>
										</span>
									</Field.Label>
								</Field.Root>
							{/each}
						</div>
					</section>

					{#if orderedIds.length > 0}
						<section class="grid gap-3 rounded-lg border border-border bg-card p-4">
							<div class="flex items-center justify-between gap-3">
								<h3 class="font-mono text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
									Column Order
								</h3>
								<Badge variant="outline">{orderedIds.length} visible</Badge>
							</div>
							<ol class="grid gap-2">
								{#each orderedIds as typeId, i (typeId)}
									<li
										class="flex items-center justify-between gap-3 rounded-lg border border-border bg-background p-3 text-sm"
									>
										<span class="font-semibold text-foreground">{getTypeName(typeId)}</span>
										<div class="flex gap-1">
											<Button
												variant="outline"
												size="icon"
												type="button"
												onclick={() => moveUp(i)}
												disabled={i === 0}
												aria-label="Move up"
											>
												↑
											</Button>
											<Button
												variant="outline"
												size="icon"
												type="button"
												onclick={() => moveDown(i)}
												disabled={i === orderedIds.length - 1}
												aria-label="Move down"
											>
												↓
											</Button>
										</div>
									</li>
								{/each}
							</ol>
						</section>
					{/if}
				</div>
			{/if}
		</AppDialog.Body>

		<AppDialog.Footer>
			{#if mode === 'list'}
				{#if !readOnly}
					<Button type="button" onclick={startCreate}>New View</Button>
				{/if}
				<div class="flex-1"></div>
				<Button variant="outline" type="button" onclick={onClose}>Close</Button>
			{:else}
				<Button variant="outline" type="button" onclick={() => (mode = 'list')} disabled={saving}>Back</Button>
				<div class="flex-1"></div>
				<Button variant="outline" type="button" onclick={() => (mode = 'list')} disabled={saving}>Cancel</Button>
				<Button type="button" onclick={handleSave} disabled={saving}>
					{saving ? 'Saving...' : 'Save'}
				</Button>
			{/if}
		</AppDialog.Footer>
	</AppDialog.Content>
</AppDialog.Root>

{#if confirmDeleteView}
	<ConfirmDialog
		title="Delete Saved View"
		message={`Delete "${confirmDeleteView.name}"? This only removes the saved layout.`}
		confirmLabel="Delete"
		variant="danger"
		onConfirm={doDelete}
		onCancel={() => (confirmDeleteView = null)}
	/>
{/if}
