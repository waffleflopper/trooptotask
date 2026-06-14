<script lang="ts">
	import * as AppDialog from '$lib/components/ui/app-dialog';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { CalendarStatusBadge } from '$lib/components/ui/calendar-status-badge';
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { NativeSelect } from '$lib/components/ui/native-select';
	import { dailyAssignmentsStore } from '$features/calendar/stores/dailyAssignments.svelte';
	import type { AssignmentType } from '$lib/types';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Trash2 from '@lucide/svelte/icons/trash-2';

	type Props = {
		canMutate: boolean;
		searchQuery: string;
	};

	let { canMutate, searchQuery }: Props = $props();

	let addAssignmentOpen = $state(false);
	let newAssignName = $state('');
	let newAssignShortName = $state('');
	let newAssignTo = $state<'personnel' | 'group'>('personnel');
	let newAssignColor = $state('#c47f00');

	let editAssignmentOpen = $state(false);
	let editingAssign = $state<AssignmentType | null>(null);
	let editAssignName = $state('');
	let editAssignShortName = $state('');
	let editAssignTo = $state<'personnel' | 'group'>('personnel');
	let editAssignColor = $state('');

	let confirmDeleteAssign = $state<AssignmentType | null>(null);

	const activeAssignmentTypes = $derived(dailyAssignmentsStore.types.filter((type) => !type.archivedAt));
	const headerTypeId = $derived(activeAssignmentTypes.find((t) => t.showInDateHeader)?.id ?? null);
	const addAssignmentDirty = $derived(
		newAssignName.trim() !== '' ||
			newAssignShortName.trim() !== '' ||
			newAssignTo !== 'personnel' ||
			newAssignColor !== '#c47f00'
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
		newAssignColor = '#c47f00';
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

	async function addAssignType() {
		if (!canMutate || !newAssignName.trim() || !newAssignShortName.trim()) return;
		await dailyAssignmentsStore.addType({
			name: newAssignName.trim(),
			shortName: newAssignShortName.trim().toUpperCase(),
			assignTo: newAssignTo,
			color: newAssignColor,
			exemptPersonnelIds: [],
			showInDateHeader: false
		});
		resetAddAssignForm();
		addAssignmentOpen = false;
	}

	async function saveEditAssign() {
		if (!editingAssign || !editAssignName.trim() || !editAssignShortName.trim()) return;
		await dailyAssignmentsStore.updateType(editingAssign.id, {
			name: editAssignName.trim(),
			shortName: editAssignShortName.trim().toUpperCase(),
			assignTo: editAssignTo,
			color: editAssignColor
		});
		editAssignmentOpen = false;
		editingAssign = null;
	}

	async function deleteAssignType(t: AssignmentType) {
		if (!canMutate) return;
		await dailyAssignmentsStore.removeType(t.id);
		confirmDeleteAssign = null;
	}

	async function setShowInDateHeader(id: string | null) {
		if (!canMutate) return;
		const prev = activeAssignmentTypes.find((t) => t.showInDateHeader);
		if (prev && prev.id !== id) {
			await dailyAssignmentsStore.updateType(prev.id, { showInDateHeader: false });
		}
		if (id) {
			await dailyAssignmentsStore.updateType(id, { showInDateHeader: true });
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

<div class="space-y-1.5">
	{#each filteredAssignments as type (type.id)}
		<div
			class="flex items-center gap-4 rounded-md border border-transparent px-4 py-3 transition-colors hover:border-border hover:bg-muted/40"
		>
			{#if canMutate}
				<label class="flex flex-col items-center gap-0.5">
					<input
						type="radio"
						name="showInDateHeader"
						value={type.id}
						checked={headerTypeId === type.id}
						class="accent-amber-500"
						aria-label="Show {type.name} in date header"
						onchange={() => setShowInDateHeader(type.id)}
					/>
					<span class="font-mono text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
						Header
					</span>
				</label>
			{/if}
			<div class="flex flex-1 flex-col gap-0.5">
				<span class="text-sm font-medium">{type.name}</span>
				<span class="text-xs text-muted-foreground">
					{type.assignTo === 'personnel' ? 'Assigned to person' : 'Assigned to group'}
				</span>
			</div>
			{#if type.showInDateHeader}
				<Badge variant="outline" class="text-[10px]">Date header</Badge>
			{/if}
			<CalendarStatusBadge
				statusType={{ id: type.id, name: type.shortName, color: type.color, textColor: '#ffffff' }}
				class="font-mono font-bold uppercase tracking-widest"
			>
				{type.shortName}
			</CalendarStatusBadge>
			{#if canMutate}
				<div class="flex gap-1">
					<Button
						variant="ghost"
						size="icon-sm"
						class="size-7"
						title="Edit assignment type"
						aria-label="Edit assignment type"
						onclick={() => openEditAssign(type)}
					>
						<Pencil class="size-3.5" />
					</Button>
					<Button
						variant="ghost"
						size="icon-sm"
						class="size-7 text-destructive hover:text-destructive"
						title="Delete assignment type"
						aria-label="Delete assignment type"
						onclick={() => (confirmDeleteAssign = type)}
					>
						<Trash2 class="size-3.5" />
					</Button>
				</div>
			{/if}
		</div>
	{:else}
		<div class="flex items-center justify-center py-12 text-sm text-muted-foreground">No assignment types found</div>
	{/each}
</div>

<AppDialog.Root bind:open={addAssignmentOpen} closeBlocked={addAssignmentDirty} onClose={closeAddAssignmentDialog}>
	<AppDialog.Content closeBlocked={addAssignmentDirty}>
		<AppDialog.Header>
			<AppDialog.Title>Add Assignment Type</AppDialog.Title>
			<AppDialog.Description>Create a new duty coverage assignment for daily scheduling.</AppDialog.Description>
		</AppDialog.Header>
		<AppDialog.Body class="grid gap-4">
			<div class="grid gap-2">
				<Label for="add-assign-name">Full name</Label>
				<Input id="add-assign-name" type="text" placeholder="e.g., Staff Duty" bind:value={newAssignName} />
			</div>
			<div class="flex items-end gap-4">
				<div class="grid flex-1 gap-2">
					<Label for="add-assign-short">Short code</Label>
					<Input
						id="add-assign-short"
						type="text"
						placeholder="e.g., SD"
						maxlength={5}
						class="uppercase"
						bind:value={newAssignShortName}
					/>
				</div>
				<div class="grid gap-2">
					<Label for="add-assign-color">Color</Label>
					<input
						id="add-assign-color"
						type="color"
						bind:value={newAssignColor}
						class="size-9 cursor-pointer rounded-md border border-border p-0.5"
					/>
				</div>
				{#if newAssignShortName.trim()}
					<div>
						<Label>Preview</Label>
						<div class="mt-2">
							<CalendarStatusBadge
								statusType={{
									id: 'assign-preview',
									name: newAssignShortName.trim().toUpperCase(),
									color: newAssignColor,
									textColor: '#ffffff'
								}}
								class="font-mono font-bold uppercase tracking-widest"
							>
								{newAssignShortName.trim().toUpperCase()}
							</CalendarStatusBadge>
						</div>
					</div>
				{/if}
			</div>
			<div class="grid gap-2">
				<Label for="add-assign-to">Assign to</Label>
				<NativeSelect id="add-assign-to" bind:value={newAssignTo}>
					<option value="personnel">Person</option>
					<option value="group">Group</option>
				</NativeSelect>
			</div>
		</AppDialog.Body>
		<AppDialog.Footer>
			<Button variant="outline" onclick={closeAddAssignmentDialog}>Cancel</Button>
			<Button onclick={addAssignType} disabled={!newAssignName.trim() || !newAssignShortName.trim()}>
				Add Assignment Type
			</Button>
		</AppDialog.Footer>
	</AppDialog.Content>
</AppDialog.Root>

<AppDialog.Root bind:open={editAssignmentOpen} closeBlocked={editAssignmentDirty} onClose={closeEditAssignmentDialog}>
	<AppDialog.Content closeBlocked={editAssignmentDirty}>
		<AppDialog.Header>
			<AppDialog.Title>Edit Assignment Type</AppDialog.Title>
			<AppDialog.Description>Update this duty coverage assignment.</AppDialog.Description>
		</AppDialog.Header>
		<AppDialog.Body class="grid gap-4">
			<div class="grid gap-2">
				<Label for="edit-assign-name">Full name</Label>
				<Input id="edit-assign-name" type="text" bind:value={editAssignName} />
			</div>
			<div class="flex items-end gap-4">
				<div class="grid flex-1 gap-2">
					<Label for="edit-assign-short">Short code</Label>
					<Input id="edit-assign-short" type="text" maxlength={5} class="uppercase" bind:value={editAssignShortName} />
				</div>
				<div class="grid gap-2">
					<Label for="edit-assign-color">Color</Label>
					<input
						id="edit-assign-color"
						type="color"
						bind:value={editAssignColor}
						class="size-9 cursor-pointer rounded-md border border-border p-0.5"
					/>
				</div>
				{#if editAssignShortName.trim()}
					<div>
						<Label>Preview</Label>
						<div class="mt-2">
							<CalendarStatusBadge
								statusType={{
									id: 'edit-assign-preview',
									name: editAssignShortName.trim().toUpperCase(),
									color: editAssignColor,
									textColor: '#ffffff'
								}}
								class="font-mono font-bold uppercase tracking-widest"
							>
								{editAssignShortName.trim().toUpperCase()}
							</CalendarStatusBadge>
						</div>
					</div>
				{/if}
			</div>
			<div class="grid gap-2">
				<Label for="edit-assign-to">Assign to</Label>
				<NativeSelect id="edit-assign-to" bind:value={editAssignTo}>
					<option value="personnel">Person</option>
					<option value="group">Group</option>
				</NativeSelect>
			</div>
		</AppDialog.Body>
		<AppDialog.Footer>
			<Button variant="outline" onclick={closeEditAssignmentDialog}>Cancel</Button>
			<Button onclick={saveEditAssign} disabled={!editAssignName.trim() || !editAssignShortName.trim()}>
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
			if (confirmDeleteAssign) deleteAssignType(confirmDeleteAssign);
		}}
		onCancel={() => (confirmDeleteAssign = null)}
	/>
{/if}
