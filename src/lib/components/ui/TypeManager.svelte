<script lang="ts" generics="T extends { id: string; name: string }">
	import type { Snippet } from 'svelte';
	import Modal from '$lib/components/Modal.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
	import { Button } from '$lib/components/ui/button';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';

	interface Props {
		items: T[];
		onAdd: (data: Omit<T, 'id'>) => void;
		onUpdate: (id: string, data: Partial<Omit<T, 'id'>>) => void;
		onRemove: (id: string) => void;
		onClose: () => void;
		title: string;
		noun?: string;
		titleId?: string;
		width?: string;
		removeConfirmMessage?: (item: T) => string;
		getAddData: () => Omit<T, 'id'> | null;
		resetAddForm: () => void;
		onEditStart: (item: T) => void;
		getEditData: () => Partial<Omit<T, 'id'>> | null;
		addForm: Snippet;
		editForm: Snippet;
		itemDisplay: Snippet<[T]>;
	}

	let {
		items,
		onAdd,
		onUpdate,
		onRemove,
		onClose,
		title,
		noun = 'Item',
		titleId,
		width = '560px',
		removeConfirmMessage,
		getAddData,
		resetAddForm,
		onEditStart,
		getEditData,
		addForm,
		editForm,
		itemDisplay
	}: Props = $props();

	let editingId = $state<string | null>(null);
	let confirmRemove = $state<{ id: string; name: string } | null>(null);

	const canAdd = $derived(getAddData() !== null);

	function handleAdd() {
		const data = getAddData();
		if (!data) return;
		onAdd(data);
		resetAddForm();
	}

	function handleKeyDown(e: KeyboardEvent) {
		if (e.key === 'Enter' && canAdd) {
			handleAdd();
		}
	}

	function startEdit(item: T) {
		editingId = item.id;
		onEditStart(item);
	}

	function saveEdit() {
		if (!editingId) return;
		const data = getEditData();
		if (!data) return;
		onUpdate(editingId, data);
		cancelEdit();
	}

	function cancelEdit() {
		editingId = null;
	}

	function handleRemove(id: string, name: string) {
		confirmRemove = { id, name };
	}

	function doRemove() {
		if (confirmRemove) {
			onRemove(confirmRemove.id);
			confirmRemove = null;
		}
	}
</script>

<Modal {title} {onClose} {width} {titleId}>
	<div class="border-b pb-4">
		<h4 class="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">Add New {noun}</h4>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="flex flex-col gap-2 overflow-hidden [&_.input]:min-w-0" onkeydown={handleKeyDown}>
			{@render addForm()}
			<Button size="sm" onclick={handleAdd} disabled={!canAdd}>Add</Button>
		</div>
	</div>

	<div class="mt-4">
		<h4 class="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">Existing {noun}s ({items.length})</h4>
		{#if items.length === 0}
			<EmptyState message="No {noun.toLowerCase()}s yet. Add one above to get started." />
		{:else}
			<div class="flex flex-col gap-1">
				{#each items as item (item.id)}
					<div
						class={[
							'group flex items-center justify-between rounded-lg border px-3 py-2 transition-colors hover:bg-muted/50',
							editingId === item.id ? 'border-ring bg-muted/60' : 'border-transparent bg-muted/30'
						]}
					>
						{#if editingId === item.id}
							<div class="flex w-full flex-col gap-2 overflow-hidden [&_.input]:min-w-[120px] [&_.input]:flex-1">
								{@render editForm()}
								<div class="flex gap-1">
									<Button size="sm" onclick={saveEdit}>Save</Button>
									<Button variant="outline" size="sm" onclick={cancelEdit}>Cancel</Button>
								</div>
							</div>
						{:else}
							<div class="flex min-w-0 items-center">
								{@render itemDisplay(item)}
							</div>
							<div class="flex gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
								<Button variant="outline" size="icon-sm" onclick={() => startEdit(item)} title="Edit" aria-label="Edit">
									<PencilIcon />
								</Button>
								<Button
									variant="destructive"
									size="icon-sm"
									onclick={() => handleRemove(item.id, item.name)}
									title="Remove"
									aria-label="Remove"
								>
									<Trash2Icon />
								</Button>
							</div>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	</div>

	{#snippet footer()}
		<Button onclick={onClose}>Done</Button>
	{/snippet}
</Modal>

{#if confirmRemove}
	{@const removing = confirmRemove}
	<ConfirmDialog
		title="Remove {noun}"
		message={removeConfirmMessage
			? removeConfirmMessage(items.find((i) => i.id === removing.id) as T)
			: `Remove "${removing.name}"? This cannot be undone.`}
		confirmLabel="Remove"
		variant="danger"
		onConfirm={doRemove}
		onCancel={() => (confirmRemove = null)}
	/>
{/if}
