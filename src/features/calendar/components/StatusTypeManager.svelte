<script lang="ts">
	import type { StatusType } from '$features/calendar/calendar.types';
	import TypeManager from '$lib/components/ui/TypeManager.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';

	interface Props {
		statusTypes: StatusType[];
		onAdd: (data: Omit<StatusType, 'id'>) => void;
		onUpdate: (id: string, data: Partial<Omit<StatusType, 'id'>>) => void;
		onRemove: (id: string) => void;
		onClose: () => void;
	}

	let { statusTypes, onAdd, onUpdate, onRemove, onClose }: Props = $props();

	let newName = $state('');
	let newColor = $state('#6b7280');
	let newTextColor = $state('#ffffff');

	let editName = $state('');
	let editColor = $state('');
	let editTextColor = $state('');
</script>

<TypeManager
	items={statusTypes}
	title="Manage Status Types"
	noun="Status Type"
	titleId="status-manager-title"
	{onAdd}
	{onUpdate}
	{onRemove}
	{onClose}
	getAddData={() => (newName.trim() ? { name: newName.trim(), color: newColor, textColor: newTextColor } : null)}
	resetAddForm={() => {
		newName = '';
		newColor = '#6b7280';
		newTextColor = '#ffffff';
	}}
	onEditStart={(s) => {
		editName = s.name;
		editColor = s.color;
		editTextColor = s.textColor;
	}}
	getEditData={() => (editName.trim() ? { name: editName.trim(), color: editColor, textColor: editTextColor } : null)}
	removeConfirmMessage={(s) =>
		`Remove "${s.name}"? All schedule entries using this status will also be removed. This cannot be undone.`}
>
	{#snippet addForm()}
		<input
			type="text"
			class="input"
			bind:value={newName}
			placeholder="Status name (e.g., Leave, TDY)"
			aria-label="Status name"
		/>
		<div class="color-pickers">
			<label class="color-picker">
				<span>Background</span>
				<input type="color" bind:value={newColor} />
			</label>
			<label class="color-picker">
				<span>Text</span>
				<input type="color" bind:value={newTextColor} />
			</label>
		</div>
		{#if newName.trim()}
			<Badge label={newName} color={newColor} textColor={newTextColor} />
		{/if}
	{/snippet}

	{#snippet itemDisplay(status)}
		<Badge label={status.name} color={status.color} textColor={status.textColor} />
	{/snippet}

	{#snippet editForm()}
		<input type="text" class="input" bind:value={editName} placeholder="Status name" aria-label="Status name" />
		<div class="color-pickers">
			<label class="color-picker">
				<span>BG</span>
				<input type="color" bind:value={editColor} />
			</label>
			<label class="color-picker">
				<span>Text</span>
				<input type="color" bind:value={editTextColor} />
			</label>
		</div>
		<Badge label={editName || 'Preview'} color={editColor} textColor={editTextColor} />
	{/snippet}
</TypeManager>

<style>
	.color-pickers {
		display: flex;
		gap: var(--spacing-sm);
	}

	.color-picker {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
		font-size: 10px;
		color: var(--color-text-muted);
		text-transform: uppercase;
	}

	.color-picker input[type='color'] {
		width: 32px;
		height: 32px;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		cursor: pointer;
		padding: 0;
	}
</style>
