<script lang="ts">
	import type { AssignmentType } from '$lib/types';
	import TypeManager from '$lib/components/ui/TypeManager.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';

	interface Props {
		assignmentTypes: AssignmentType[];
		onAdd: (data: Omit<AssignmentType, 'id'>) => void;
		onUpdate: (id: string, data: Partial<Omit<AssignmentType, 'id'>>) => void;
		onRemove: (id: string) => void;
		onClose: () => void;
	}

	let { assignmentTypes, onAdd, onUpdate, onRemove, onClose }: Props = $props();

	let newName = $state('');
	let newShortName = $state('');
	let newAssignTo = $state<'personnel' | 'group'>('personnel');
	let newColor = $state('#3b82f6');

	let editName = $state('');
	let editShortName = $state('');
	let editAssignTo = $state<'personnel' | 'group'>('personnel');
	let editColor = $state('');
</script>

<TypeManager
	items={assignmentTypes}
	title="Manage Assignment Types"
	noun="Assignment Type"
	titleId="assign-types-title"
	width="560px"
	{onAdd}
	{onUpdate}
	{onRemove}
	{onClose}
	getAddData={() =>
		newName.trim() && newShortName.trim()
			? {
					name: newName.trim(),
					shortName: newShortName.trim().toUpperCase(),
					assignTo: newAssignTo,
					color: newColor,
					exemptPersonnelIds: []
				}
			: null}
	resetAddForm={() => {
		newName = '';
		newShortName = '';
		newAssignTo = 'personnel';
		newColor = '#3b82f6';
	}}
	onEditStart={(t) => {
		editName = t.name;
		editShortName = t.shortName;
		editAssignTo = t.assignTo;
		editColor = t.color;
	}}
	getEditData={() =>
		editName.trim() && editShortName.trim()
			? {
					name: editName.trim(),
					shortName: editShortName.trim().toUpperCase(),
					assignTo: editAssignTo,
					color: editColor
				}
			: null}
	removeConfirmMessage={(t) =>
		`Remove "${t.name}"? All assignments using this type will also be removed. This cannot be undone.`}
>
	{#snippet addForm()}
		<div class="form-row">
			<input
				type="text"
				class="input"
				bind:value={newName}
				placeholder="Full name (e.g., Staff Duty)"
				aria-label="Full name"
			/>
			<input
				type="text"
				class="input short-input"
				bind:value={newShortName}
				placeholder="Short (e.g., SD)"
				aria-label="Short name"
				maxlength="5"
			/>
		</div>
		<div class="form-row">
			<select class="select" aria-label="Assign to" bind:value={newAssignTo}>
				<option value="personnel">Assign to Person</option>
				<option value="group">Assign to Group</option>
			</select>
			<label class="color-picker">
				<span>Color</span>
				<input type="color" bind:value={newColor} />
			</label>
			{#if newName.trim() && newShortName.trim()}
				<Badge label={newShortName.toUpperCase() || '?'} color={newColor} bold={true} />
			{/if}
		</div>
		<p class="hint">
			<strong>Assign to Person:</strong> Shows on individual's calendar row (e.g., MOD, CQ)<br />
			<strong>Assign to Group:</strong> Shows in date header column (e.g., Front Desk duty group)
		</p>
	{/snippet}

	{#snippet itemDisplay(type)}
		<Badge label={type.shortName} color={type.color} bold={true} />
		<div class="type-info">
			<span class="type-name">{type.name}</span>
			<span class="type-assign-to">
				{type.assignTo === 'personnel' ? 'Assigned to person' : 'Assigned to group'}
			</span>
		</div>
	{/snippet}

	{#snippet editForm()}
		<div class="form-row">
			<input type="text" class="input" bind:value={editName} placeholder="Full name" aria-label="Full name" />
			<input
				type="text"
				class="input short-input"
				bind:value={editShortName}
				placeholder="Short"
				aria-label="Short name"
				maxlength="5"
			/>
		</div>
		<div class="form-row">
			<select class="select" aria-label="Assign to" bind:value={editAssignTo}>
				<option value="personnel">Person</option>
				<option value="group">Group</option>
			</select>
			<label class="color-picker">
				<span>Color</span>
				<input type="color" bind:value={editColor} />
			</label>
			<Badge label={editShortName.toUpperCase() || '?'} color={editColor} bold={true} />
		</div>
	{/snippet}
</TypeManager>

<style>
	.form-row {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		flex-wrap: wrap;
	}

	.form-row :global(.input) {
		flex: 1;
		min-width: 150px;
	}

	.short-input {
		flex: 0 0 80px !important;
		min-width: 80px !important;
		text-transform: uppercase;
	}

	.form-row :global(.select) {
		flex: 0 0 140px;
	}

	.hint {
		font-size: var(--font-size-xs);
		color: var(--color-text-muted);
		margin-top: var(--spacing-sm);
		line-height: 1.5;
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

	.type-info {
		display: flex;
		flex-direction: column;
	}

	.type-name {
		font-weight: 500;
		color: var(--color-text);
	}

	.type-assign-to {
		font-size: var(--font-size-xs);
		color: var(--color-text-muted);
	}
</style>
