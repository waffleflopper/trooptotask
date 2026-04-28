<script lang="ts">
	import type { StatusType } from '$lib/types';
	import TypeManager from '$lib/components/ui/TypeManager.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import {
		DA6_AVAILABILITY_HELP,
		DA6_AVAILABILITY_TREATMENT_OPTIONS,
		DA6_TREATMENT_NONE,
		formatDa6AvailabilityTreatment,
		toDa6AvailabilityTreatment,
		type Da6AvailabilityTreatmentOption
	} from '$features/calendar/utils/da6AvailabilityTreatment';

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
	let newDa6Treatment = $state<Da6AvailabilityTreatmentOption>(DA6_TREATMENT_NONE);

	let editName = $state('');
	let editColor = $state('');
	let editTextColor = $state('');
	let editDa6Treatment = $state<Da6AvailabilityTreatmentOption>(DA6_TREATMENT_NONE);
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
	getAddData={() =>
		newName.trim()
			? {
					name: newName.trim(),
					color: newColor,
					textColor: newTextColor,
					da6AvailabilityTreatment: toDa6AvailabilityTreatment(newDa6Treatment)
				}
			: null}
	resetAddForm={() => {
		newName = '';
		newColor = '#6b7280';
		newTextColor = '#ffffff';
		newDa6Treatment = DA6_TREATMENT_NONE;
	}}
	onEditStart={(s) => {
		editName = s.name;
		editColor = s.color;
		editTextColor = s.textColor;
		editDa6Treatment = s.da6AvailabilityTreatment ?? DA6_TREATMENT_NONE;
	}}
	getEditData={() =>
		editName.trim()
			? {
					name: editName.trim(),
					color: editColor,
					textColor: editTextColor,
					da6AvailabilityTreatment: toDa6AvailabilityTreatment(editDa6Treatment)
				}
			: null}
	removeConfirmMessage={(s) =>
		`Remove "${s.name}"? All schedule entries using this status will also be removed. This cannot be undone.`}
>
	{#snippet addForm()}
		<div class="inline-form">
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
			<div class="treatment-field">
				<label class="treatment-label" for="new-da6-treatment">
					<span>Duty roster treatment</span>
					<span class="help-wrapper">
						<button class="help-icon" type="button" aria-label="Duty roster treatment help">
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
								<path
									d="M12 6.75c-1.8 0-3 1.01-3 2.52h1.73c0-.69.52-1.1 1.22-1.1.76 0 1.29.44 1.29 1.11 0 .62-.34.93-1.08 1.38-.95.57-1.66 1.19-1.66 2.59v.38h1.72v-.25c0-.84.37-1.18 1.19-1.68.88-.53 1.57-1.19 1.57-2.52 0-1.76-1.39-2.43-2.98-2.43Z"
								/>
								<circle cx="12" cy="17.35" r="1" fill="currentColor" stroke="none" />
							</svg>
						</button>
						<span class="help-tooltip" role="tooltip">{DA6_AVAILABILITY_HELP}</span>
					</span>
				</label>
				<select id="new-da6-treatment" class="select" bind:value={newDa6Treatment}>
					{#each DA6_AVAILABILITY_TREATMENT_OPTIONS as option (option.value)}
						<option value={option.value} disabled={option.disabled}>{option.label}</option>
					{/each}
				</select>
			</div>
		</div>
	{/snippet}

	{#snippet itemDisplay(status)}
		<div class="status-display">
			<Badge label={status.name} color={status.color} textColor={status.textColor} />
			<span class="treatment-summary">{formatDa6AvailabilityTreatment(status.da6AvailabilityTreatment)}</span>
		</div>
	{/snippet}

	{#snippet editForm()}
		<div class="inline-form">
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
			<div class="treatment-field">
				<label class="treatment-label" for="edit-da6-treatment">Duty roster treatment</label>
				<select id="edit-da6-treatment" class="select" bind:value={editDa6Treatment}>
					{#each DA6_AVAILABILITY_TREATMENT_OPTIONS as option (option.value)}
						<option value={option.value} disabled={option.disabled}>{option.label}</option>
					{/each}
				</select>
			</div>
		</div>
	{/snippet}
</TypeManager>

<style>
	.inline-form {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		flex-wrap: wrap;
	}

	.inline-form .input {
		flex: 1;
		min-width: 150px;
	}

	.status-display {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		flex-wrap: wrap;
	}

	.treatment-summary {
		color: var(--text-tertiary);
		font-size: var(--text-xs);
	}

	.treatment-field {
		display: flex;
		flex-direction: column;
		gap: var(--sp-1);
		min-width: min(100%, 18rem);
	}

	.treatment-label {
		display: inline-flex;
		align-items: center;
		gap: var(--sp-1);
		font-size: var(--text-xs);
		font-weight: 600;
		color: var(--text-tertiary);
		text-transform: uppercase;
	}

	.help-wrapper {
		position: relative;
		display: inline-flex;
	}

	.help-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 1.25rem;
		height: 1.25rem;
		border: 1px solid var(--border-default);
		border-radius: 999px;
		background: var(--surface-panel);
		color: var(--text-tertiary);
		cursor: help;
	}

	.help-icon svg {
		width: 0.85rem;
		height: 0.85rem;
	}

	.help-tooltip {
		position: absolute;
		left: 50%;
		bottom: calc(100% + var(--sp-2));
		z-index: var(--z-tooltip);
		width: min(18rem, 80vw);
		padding: var(--sp-2);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-sm);
		background: var(--surface-panel);
		box-shadow: var(--shadow-md);
		color: var(--text-primary);
		font-size: var(--text-xs);
		font-weight: 500;
		line-height: 1.35;
		text-transform: none;
		transform: translateX(-50%);
		opacity: 0;
		pointer-events: none;
		transition: opacity var(--transition-fast);
	}

	.help-wrapper:hover .help-tooltip,
	.help-wrapper:focus-within .help-tooltip {
		opacity: 1;
	}

	.color-pickers {
		display: flex;
		gap: var(--sp-2);
	}

	.color-picker {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
		font-size: 10px;
		color: var(--text-tertiary);
		text-transform: uppercase;
	}

	.color-picker input[type='color'] {
		width: 32px;
		height: 32px;
		border: 1px solid var(--border-default);
		border-radius: var(--radius-sm);
		cursor: pointer;
		padding: 0;
	}
</style>
