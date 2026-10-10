<script lang="ts">
	import * as AppDialog from '$lib/components/ui/app-dialog';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { ConfirmDialog } from '$lib/components/ui/confirm-dialog';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import { NativeSelect } from '$lib/components/ui/native-select';
	import * as RadioGroup from '$lib/components/ui/radio-group';
	import { Spinner } from '$lib/components/ui/spinner';
	import { dailyAssignmentsStore } from '$features/calendar/stores/dailyAssignments.svelte';
	import { toastStore } from '$lib/stores/toast.svelte';
	import type { AssignmentType } from '$features/calendar/contracts';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import { PendingSave } from '$lib/utils/pendingSave.svelte';

	type Props = {
		canMutate: boolean;
		searchQuery: string;
	};

	let { canMutate, searchQuery }: Props = $props();

	// A color input only accepts #rrggbb, and the chosen value is saved as the type's color.
	const DEFAULT_ASSIGNMENT_COLOR = '#c47f00';

	let addAssignmentOpen = $state(false);
	let newAssignName = $state('');
	let newAssignShortName = $state('');
	let newAssignTo = $state<'personnel' | 'group'>('personnel');
	let newAssignColor = $state(DEFAULT_ASSIGNMENT_COLOR);

	let editAssignmentOpen = $state(false);
	let editingAssign = $state<AssignmentType | null>(null);
	let editAssignName = $state('');
	let editAssignShortName = $state('');
	let editAssignTo = $state<'personnel' | 'group'>('personnel');
	let editAssignColor = $state('');

	let confirmDeleteAssign = $state<AssignmentType | null>(null);
	const saving = new PendingSave();

	const activeAssignmentTypes = $derived(dailyAssignmentsStore.types.filter((type) => !type.archivedAt));
	const headerTypeId = $derived(activeAssignmentTypes.find((t) => t.showInDateHeader)?.id ?? null);
	const addAssignmentDirty = $derived(
		newAssignName.trim() !== '' ||
			newAssignShortName.trim() !== '' ||
			newAssignTo !== 'personnel' ||
			newAssignColor !== DEFAULT_ASSIGNMENT_COLOR
	);
	const editAssignmentDirty = $derived(
		Boolean(
			editingAssign &&
			(editAssignName !== editingAssign.name ||
				editAssignShortName !== editingAssign.shortName ||
				editAssignTo !== editingAssign.assignTo ||
				editAssignColor !== editingAssign.color)
		)
	);

	const filteredAssignments = $derived(
		activeAssignmentTypes.filter((t) => !searchQuery || t.name.toLowerCase().includes(searchQuery.toLowerCase()))
	);

	export function openAddDialog() {
		if (!canMutate) return;
		addAssignmentOpen = true;
	}

	function resetAddAssignForm() {
		newAssignName = '';
		newAssignShortName = '';
		newAssignTo = 'personnel';
		newAssignColor = DEFAULT_ASSIGNMENT_COLOR;
	}

	function closeAddAssignmentDialog() {
		resetAddAssignForm();
		addAssignmentOpen = false;
	}

	function closeEditAssignmentDialog() {
		editAssignmentOpen = false;
		editingAssign = null;
	}

	function openEditAssign(t: AssignmentType) {
		editingAssign = t;
		editAssignName = t.name;
		editAssignShortName = t.shortName;
		editAssignTo = t.assignTo;
		editAssignColor = t.color;
		editAssignmentOpen = true;
	}

	function showAssignmentMutationError(message: string, error?: unknown) {
		toastStore.error(error instanceof Error ? error.message : message);
	}

	async function addAssignType() {
		if (!canMutate || !newAssignName.trim() || !newAssignShortName.trim()) return;
		try {
			const created = await dailyAssignmentsStore.addType({
				name: newAssignName.trim(),
				shortName: newAssignShortName.trim().toUpperCase(),
				assignTo: newAssignTo,
				color: newAssignColor,
				exemptPersonnelIds: [],
				showInDateHeader: false
			});
			if (!created) {
				showAssignmentMutationError('Failed to add assignment type');
				return;
			}
		} catch (error) {
			showAssignmentMutationError('Failed to add assignment type', error);
			return;
		}
		resetAddAssignForm();
		addAssignmentOpen = false;
	}

	async function saveEditAssign() {
		if (!canMutate || !editingAssign || !editAssignName.trim() || !editAssignShortName.trim()) return;
		try {
			const saved = await dailyAssignmentsStore.updateType(editingAssign.id, {
				name: editAssignName.trim(),
				shortName: editAssignShortName.trim().toUpperCase(),
				assignTo: editAssignTo,
				color: editAssignColor
			});
			if (!saved) {
				showAssignmentMutationError('Failed to save assignment type');
				return;
			}
		} catch (error) {
			showAssignmentMutationError('Failed to save assignment type', error);
			return;
		}
		editAssignmentOpen = false;
		editingAssign = null;
	}

	async function deleteAssignType(t: AssignmentType) {
		if (!canMutate) return;
		try {
			const deleted = await dailyAssignmentsStore.removeType(t.id);
			if (!deleted) {
				showAssignmentMutationError('Failed to delete assignment type');
				return;
			}
		} catch (error) {
			showAssignmentMutationError('Failed to delete assignment type', error);
			return;
		}
		confirmDeleteAssign = null;
	}

	async function setShowInDateHeader(id: string) {
		if (!canMutate) return;
		try {
			const prev = activeAssignmentTypes.find((t) => t.showInDateHeader);
			if (prev && prev.id !== id) {
				const cleared = await dailyAssignmentsStore.updateType(prev.id, { showInDateHeader: false });
				if (!cleared) {
					showAssignmentMutationError('Failed to update header assignment type');
					return;
				}
			}
			const saved = await dailyAssignmentsStore.updateType(id, { showInDateHeader: true });
			if (!saved) showAssignmentMutationError('Failed to update header assignment type');
		} catch (error) {
			showAssignmentMutationError('Failed to update header assignment type', error);
		}
	}
</script>

<p class="mb-4 rounded-md border border-border bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
	Select which assignment type's assignee appears in each calendar date column.
	{#if headerTypeId}
		Currently showing: <strong>{activeAssignmentTypes.find((t) => t.id === headerTypeId)?.name}</strong>
	{:else}
		None selected — no assignee shown in date columns.
	{/if}
</p>

<RadioGroup.Root
	bind:value={() => headerTypeId ?? '', (id) => void setShowInDateHeader(id)}
	disabled={!canMutate}
	aria-label="Assignment type shown in the date header"
	class="gap-1.5"
>
	{#each filteredAssignments as type (type.id)}
		<div
			class="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md border border-transparent px-4 py-3 transition-colors hover:border-border hover:bg-muted/40"
		>
			{#if canMutate}
				<div class="flex flex-col items-center gap-0.5">
					<RadioGroup.Item value={type.id} aria-label="Show {type.name} in date header" />
					<span
						class="font-mono text-[9px] font-semibold uppercase tracking-wider text-muted-foreground"
						aria-hidden="true"
					>
						Header
					</span>
				</div>
			{/if}
			<div class="flex min-w-0 flex-1 basis-32 flex-col gap-0.5 break-words">
				<span class="text-sm font-medium">{type.name}</span>
				<span class="text-xs text-muted-foreground">
					{type.assignTo === 'personnel' ? 'Assigned to person' : 'Assigned to group'}
				</span>
			</div>
			<div class="ml-auto flex shrink-0 items-center gap-2">
				{#if type.showInDateHeader}
					<Badge variant="outline">Date header</Badge>
				{/if}
				<Badge class="text-white" style="background-color: {type.color}">{type.shortName}</Badge>
				{#if canMutate}
					<Button
						variant="ghost"
						size="icon-sm"
						title="Edit {type.name}"
						aria-label="Edit {type.name}"
						onclick={() => openEditAssign(type)}
					>
						<Pencil />
					</Button>
					<Button
						variant="destructive"
						size="icon-sm"
						title="Delete {type.name}"
						aria-label="Delete {type.name}"
						onclick={() => (confirmDeleteAssign = type)}
					>
						<Trash2 />
					</Button>
				{/if}
			</div>
		</div>
	{:else}
		<div class="flex items-center justify-center py-12 text-sm text-muted-foreground">No assignment types found</div>
	{/each}
</RadioGroup.Root>

<AppDialog.Root
	bind:open={addAssignmentOpen}
	busy={saving.pending}
	closeBlocked={addAssignmentDirty}
	onClose={closeAddAssignmentDialog}
>
	<AppDialog.Content>
		<AppDialog.Header>
			<AppDialog.Title>Add Assignment Type</AppDialog.Title>
			<AppDialog.Description>Create a new duty coverage assignment for daily scheduling.</AppDialog.Description>
		</AppDialog.Header>
		<AppDialog.Body class="grid gap-4">
			<fieldset class="contents" disabled={saving.pending}>
				<Field.Root>
					<Field.Label for="add-assign-name">Full name</Field.Label>
					<Input id="add-assign-name" type="text" placeholder="e.g., Staff Duty" bind:value={newAssignName} />
				</Field.Root>
				<div class="flex flex-wrap items-end gap-4">
					<Field.Root class="w-auto min-w-0 flex-1">
						<Field.Label for="add-assign-short">Short code</Field.Label>
						<Input
							id="add-assign-short"
							type="text"
							placeholder="e.g., SD"
							maxlength={5}
							class="uppercase"
							bind:value={newAssignShortName}
						/>
					</Field.Root>
					<Field.Root class="w-auto">
						<Field.Label for="add-assign-color">Color</Field.Label>
						<Input id="add-assign-color" type="color" class="w-12 cursor-pointer p-1" bind:value={newAssignColor} />
					</Field.Root>
					{#if newAssignShortName.trim()}
						<Field.Root class="w-auto">
							<Field.Title>Preview</Field.Title>
							<Badge class="text-white" style="background-color: {newAssignColor}">
								{newAssignShortName.trim().toUpperCase()}
							</Badge>
						</Field.Root>
					{/if}
				</div>
				<Field.Root>
					<Field.Label for="add-assign-to">Assign to</Field.Label>
					<NativeSelect id="add-assign-to" bind:value={newAssignTo}>
						<option value="personnel">Person</option>
						<option value="group">Group</option>
					</NativeSelect>
				</Field.Root>
			</fieldset>
		</AppDialog.Body>
		<AppDialog.Footer>
			<Button variant="outline" onclick={closeAddAssignmentDialog} disabled={saving.pending}>Cancel</Button>
			<Button
				onclick={() => saving.run(addAssignType)}
				disabled={saving.pending || !newAssignName.trim() || !newAssignShortName.trim()}
			>
				{#if saving.pending}<Spinner />{/if}
				Add Assignment Type
			</Button>
		</AppDialog.Footer>
	</AppDialog.Content>
</AppDialog.Root>

<AppDialog.Root
	bind:open={editAssignmentOpen}
	busy={saving.pending}
	closeBlocked={editAssignmentDirty}
	onClose={closeEditAssignmentDialog}
>
	<AppDialog.Content>
		<AppDialog.Header>
			<AppDialog.Title>Edit Assignment Type</AppDialog.Title>
			<AppDialog.Description>Update this duty coverage assignment.</AppDialog.Description>
		</AppDialog.Header>
		<AppDialog.Body class="grid gap-4">
			<fieldset class="contents" disabled={saving.pending}>
				<Field.Root>
					<Field.Label for="edit-assign-name">Full name</Field.Label>
					<Input id="edit-assign-name" type="text" bind:value={editAssignName} />
				</Field.Root>
				<div class="flex flex-wrap items-end gap-4">
					<Field.Root class="w-auto min-w-0 flex-1">
						<Field.Label for="edit-assign-short">Short code</Field.Label>
						<Input
							id="edit-assign-short"
							type="text"
							maxlength={5}
							class="uppercase"
							bind:value={editAssignShortName}
						/>
					</Field.Root>
					<Field.Root class="w-auto">
						<Field.Label for="edit-assign-color">Color</Field.Label>
						<Input id="edit-assign-color" type="color" class="w-12 cursor-pointer p-1" bind:value={editAssignColor} />
					</Field.Root>
					{#if editAssignShortName.trim()}
						<Field.Root class="w-auto">
							<Field.Title>Preview</Field.Title>
							<Badge class="text-white" style="background-color: {editAssignColor}">
								{editAssignShortName.trim().toUpperCase()}
							</Badge>
						</Field.Root>
					{/if}
				</div>
				<Field.Root>
					<Field.Label for="edit-assign-to">Assign to</Field.Label>
					<NativeSelect id="edit-assign-to" bind:value={editAssignTo}>
						<option value="personnel">Person</option>
						<option value="group">Group</option>
					</NativeSelect>
				</Field.Root>
			</fieldset>
		</AppDialog.Body>
		<AppDialog.Footer>
			<Button variant="outline" onclick={closeEditAssignmentDialog} disabled={saving.pending}>Cancel</Button>
			<Button
				onclick={() => saving.run(saveEditAssign)}
				disabled={saving.pending || !editAssignName.trim() || !editAssignShortName.trim()}
			>
				{#if saving.pending}<Spinner />{/if}
				Save Changes
			</Button>
		</AppDialog.Footer>
	</AppDialog.Content>
</AppDialog.Root>

{#if confirmDeleteAssign}
	<ConfirmDialog
		title="Delete Assignment Type"
		message={`Remove "${confirmDeleteAssign.name}"? All assignments using this type will also be removed. This cannot be undone.`}
		confirmLabel="Delete"
		variant="danger"
		onConfirm={() => {
			if (confirmDeleteAssign) return deleteAssignType(confirmDeleteAssign);
		}}
		onCancel={() => (confirmDeleteAssign = null)}
	/>
{/if}
