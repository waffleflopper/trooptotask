<script lang="ts">
	import { ArrowDown, ArrowUp, Trash2 } from '@lucide/svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import * as Empty from '$lib/components/ui/empty';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
	import * as TypeWorkspace from '$lib/components/ui/type-workspace';
	import * as WorkspaceToolbar from '$lib/components/ui/workspace-toolbar';
	import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
	import { getOrgContext } from '$lib/stores/orgContext.svelte';
	import { trainingViewsStore } from '$features/training/stores/trainingViews.svelte';
	import { trainingTypesStore } from '$features/training/stores/trainingTypes.svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import type { TrainingView } from '$features/training/training.types';

	const org = getOrgContext();
	const orgUrlSegment = $derived(org.orgUrlSegment ?? org.orgId);
	const configureAffordance = $derived(
		org.affordanceForFeatureAction(POLICY_ACTION_CATALOG.training.configureRequirements, { kind: 'unscoped' })
	);
	const canMutate = $derived(configureAffordance.allowed);

	let selectedViewId: string | null = $state(null);
	let editing = $state(false);
	let creating = $state(false);
	let saving = $state(false);
	let mobileDetailOpen = $state(false);
	let confirmDeleteView: TrainingView | null = $state(null);
	let name = $state('');
	let selectedIds = new SvelteSet<string>();
	let orderedIds: string[] = $state([]);
	let error = $state('');

	const orderedViews = $derived([...trainingViewsStore.items].sort((a, b) => a.name.localeCompare(b.name)));
	const selectedView = $derived(
		creating
			? null
			: (selectedViewId ? (orderedViews.find((view) => view.id === selectedViewId) ?? null) : null) ||
					orderedViews[0] ||
					null
	);
	const typeCount = $derived(trainingTypesStore.items.length);
	const typeActionDisabled = $derived(creating || editing);

	function getTypeName(typeId: string): string {
		return trainingTypesStore.getById(typeId)?.name ?? 'Unknown';
	}

	function getViewSummary(view: TrainingView): string {
		if (view.columnIds.length === 0) return 'No columns selected';
		return `${view.columnIds.length} of ${typeCount} columns`;
	}

	function selectView(id: string) {
		if (editing || creating) return;
		selectedViewId = id;
		mobileDetailOpen = true;
	}

	function startCreate() {
		if (!canMutate) return;
		selectedViewId = null;
		name = '';
		selectedIds.clear();
		orderedIds = [];
		error = '';
		creating = true;
		editing = false;
		mobileDetailOpen = true;
	}

	function startEdit(view: TrainingView | null = selectedView) {
		if (!view || !canMutate) return;
		selectedViewId = view.id;
		name = view.name;
		selectedIds.clear();
		for (const id of view.columnIds) selectedIds.add(id);
		orderedIds = [...view.columnIds];
		error = '';
		editing = true;
		creating = false;
		mobileDetailOpen = true;
	}

	function cancelEdit() {
		const wasCreating = creating;
		editing = false;
		creating = false;
		saving = false;
		error = '';
		if (wasCreating) mobileDetailOpen = false;
	}

	function closeMobileDetail() {
		if (creating || editing) {
			cancelEdit();
		}
		mobileDetailOpen = false;
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
			if (creating) {
				const created = await trainingViewsStore.add({
					name: name.trim(),
					columnIds: orderedIds,
					createdBy: '',
					createdAt: '',
					updatedAt: ''
				});
				if (created) selectedViewId = created.id;
				creating = false;
			} else if (selectedViewId) {
				await trainingViewsStore.update(selectedViewId, {
					name: name.trim(),
					columnIds: orderedIds
				});
			}
			editing = false;
			mobileDetailOpen = true;
		} catch {
			error = 'Failed to save view.';
		} finally {
			saving = false;
		}
	}

	async function doDelete() {
		if (!confirmDeleteView) return;
		await trainingViewsStore.remove(confirmDeleteView.id);
		if (selectedViewId === confirmDeleteView.id) selectedViewId = null;
		confirmDeleteView = null;
		mobileDetailOpen = false;
	}
</script>

<TypeWorkspace.Root aria-label="Training views workspace">
	<WorkspaceToolbar.Root ariaLabel="Training view controls">
		<WorkspaceToolbar.Group label="Training view actions" zone="actions">
			<Button href={`/org/${orgUrlSegment}/training`} variant="outline">Back to Matrix</Button>
			{#if canMutate}
				<Button
					type="button"
					onclick={startCreate}
					disabled={typeActionDisabled}
					title={typeActionDisabled ? 'Finish the current edit first' : undefined}
				>
					New View
				</Button>
			{/if}
		</WorkspaceToolbar.Group>
	</WorkspaceToolbar.Root>

	<TypeWorkspace.Layout>
		<TypeWorkspace.List mobileHidden={mobileDetailOpen || creating || editing}>
			{#if orderedViews.length === 0 && !creating}
				<Empty.Root>
					<Empty.Header>
						<Empty.Title>No saved views yet.</Empty.Title>
						<Empty.Description>Create a saved column layout for the training matrix.</Empty.Description>
					</Empty.Header>
					{#if canMutate}
						<Empty.Content>
							<Button type="button" onclick={startCreate}>New View</Button>
						</Empty.Content>
					{/if}
				</Empty.Root>
			{:else}
				<TypeWorkspace.ItemList aria-label="Training views">
					{#each orderedViews as view (view.id)}
						<TypeWorkspace.ListItem
							selected={selectedView?.id === view.id && !creating}
							title={view.name}
							description={getViewSummary(view)}
							onselect={() => selectView(view.id)}
							disabled={editing || creating}
						/>
					{/each}
				</TypeWorkspace.ItemList>
			{/if}
		</TypeWorkspace.List>

		<TypeWorkspace.Detail mobileHidden={!mobileDetailOpen && !creating && !editing}>
			{#if creating || editing || selectedView}
				<TypeWorkspace.MobileBack onclick={closeMobileDetail}>Training views</TypeWorkspace.MobileBack>
			{/if}

			{#if creating || editing}
				<TypeWorkspace.Stack>
					<TypeWorkspace.DetailHeader title={creating ? 'New Training View' : 'Edit Training View'} />

					<TypeWorkspace.Form title="Basics">
						<Field.Root>
							<Field.Label for="view-name">View Name</Field.Label>
							<Input id="view-name" type="text" bind:value={name} placeholder="e.g. Annual Trainings" />
							{#if error}
								<Field.Error>{error}</Field.Error>
							{/if}
						</Field.Root>
					</TypeWorkspace.Form>

					<TypeWorkspace.Form title="Training Types">
						<div class="flex items-center justify-between gap-3">
							<TypeWorkspace.Description>
								Choose the columns this saved view should show in the training matrix.
							</TypeWorkspace.Description>
							<Badge variant="outline">{orderedIds.length} selected</Badge>
						</div>
						<div class="grid max-h-64 gap-2 overflow-y-auto rounded-lg border border-border bg-background p-3">
							{#each trainingTypesStore.items as type (type.id)}
								<Field.Root orientation="horizontal">
									<Checkbox
										id="view-type-{type.id}"
										checked={selectedIds.has(type.id)}
										onCheckedChange={() => toggleType(type.id)}
									/>
									<Field.Label for="view-type-{type.id}">
										<span class="inline-flex min-w-0 items-center gap-2">
											<span class="size-3 rounded-sm border border-border/60" style:background-color={type.color}
											></span>
											<span class="truncate">{type.name}</span>
										</span>
									</Field.Label>
								</Field.Root>
							{/each}
						</div>
					</TypeWorkspace.Form>

					{#if orderedIds.length > 0}
						<TypeWorkspace.Form title="Column Order">
							<ol class="grid gap-2">
								{#each orderedIds as typeId, i (typeId)}
									<li class="flex items-center justify-between gap-3 border-b border-border/70 py-2 last:border-b-0">
										<span class="min-w-0 truncate text-sm font-semibold text-foreground">{getTypeName(typeId)}</span>
										<div class="flex gap-1">
											<Button
												variant="outline"
												size="icon"
												type="button"
												onclick={() => moveUp(i)}
												disabled={i === 0}
												aria-label={`Move ${getTypeName(typeId)} up`}
											>
												<ArrowUp aria-hidden="true" />
											</Button>
											<Button
												variant="outline"
												size="icon"
												type="button"
												onclick={() => moveDown(i)}
												disabled={i === orderedIds.length - 1}
												aria-label={`Move ${getTypeName(typeId)} down`}
											>
												<ArrowDown aria-hidden="true" />
											</Button>
										</div>
									</li>
								{/each}
							</ol>
						</TypeWorkspace.Form>
					{/if}

					<TypeWorkspace.Actions>
						{#if !creating && selectedView && canMutate}
							<Button variant="destructive" size="sm" type="button" onclick={() => (confirmDeleteView = selectedView)}>
								<Trash2 aria-hidden="true" />
								Delete
							</Button>
						{/if}
						<TypeWorkspace.ActionSpacer />
						<Button variant="outline" size="sm" type="button" onclick={cancelEdit} disabled={saving}>Cancel</Button>
						<Button size="sm" type="button" onclick={handleSave} disabled={saving}>
							{saving ? 'Saving...' : 'Save'}
						</Button>
					</TypeWorkspace.Actions>
				</TypeWorkspace.Stack>
			{:else if selectedView}
				<TypeWorkspace.Stack>
					<TypeWorkspace.DetailHeader title={selectedView.name}>
						{#snippet actions()}
							{#if canMutate}
								<Button variant="outline" size="sm" type="button" onclick={() => startEdit(selectedView)}>Edit</Button>
							{/if}
						{/snippet}
					</TypeWorkspace.DetailHeader>

					<TypeWorkspace.Description>
						This saved layout controls which training columns appear in the matrix.
					</TypeWorkspace.Description>

					<TypeWorkspace.FactList>
						<TypeWorkspace.Impact label="Columns">{selectedView.columnIds.length} selected</TypeWorkspace.Impact>
						<TypeWorkspace.Impact label="Training Types">
							{selectedView.columnIds.map(getTypeName).join(', ') || 'No columns selected'}
						</TypeWorkspace.Impact>
					</TypeWorkspace.FactList>

					{#if canMutate}
						<TypeWorkspace.Actions>
							<Button variant="destructive" size="sm" type="button" onclick={() => (confirmDeleteView = selectedView)}>
								Delete View
							</Button>
						</TypeWorkspace.Actions>
					{/if}
				</TypeWorkspace.Stack>
			{:else}
				<Empty.Root>
					<Empty.Header>
						<Empty.Title>Select a training view</Empty.Title>
						<Empty.Description>Choose a saved layout from the list to view details.</Empty.Description>
					</Empty.Header>
				</Empty.Root>
			{/if}
		</TypeWorkspace.Detail>
	</TypeWorkspace.Layout>
</TypeWorkspace.Root>

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
