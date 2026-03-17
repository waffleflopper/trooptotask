<script lang="ts">
	import { page } from '$app/stores';
	import type { CounselingType, CounselingRecurrence } from '../counseling.types';
	import { COUNSELING_RECURRENCE_LABELS } from '../counseling.types';
	import TypeManager from '$lib/components/ui/TypeManager.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import FileUpload from '$lib/components/ui/FileUpload.svelte';

	interface Props {
		counselingTypes: CounselingType[];
		onAdd: (data: Omit<CounselingType, 'id'>) => void;
		onUpdate: (id: string, data: Partial<Omit<CounselingType, 'id'>>) => void;
		onRemove: (id: string) => void;
		onClose: () => void;
	}

	let { counselingTypes, onAdd, onUpdate, onRemove, onClose }: Props = $props();

	const orgId = $page.params.orgId!;

	// New type form
	let newName = $state('');
	let newDescription = $state('');
	let newTemplateContent = $state('');
	let newTemplateFilePath = $state<string | null>(null);
	let newRecurrence = $state<CounselingRecurrence>('none');
	let newColor = $state('#8b5cf6');
	let newIsFreeform = $state(false);
	let newUploadId = $state(crypto.randomUUID());

	// Edit form
	let editName = $state('');
	let editDescription = $state('');
	let editTemplateContent = $state('');
	let editTemplateFilePath = $state<string | null>(null);
	let editRecurrence = $state<CounselingRecurrence>('none');
	let editColor = $state('');
	let editIsFreeform = $state(false);
	let editingTypeId = $state<string | null>(null);

	function addDefaultTypes() {
		const defaults = [
			{
				name: 'Initial Counseling',
				description: 'Initial counseling for new soldiers',
				recurrence: 'none' as CounselingRecurrence,
				color: '#3b82f6'
			},
			{
				name: 'Monthly Counseling',
				description: 'Regular monthly performance counseling',
				recurrence: 'monthly' as CounselingRecurrence,
				color: '#22c55e'
			},
			{
				name: 'Quarterly Counseling',
				description: 'Quarterly review and goal setting',
				recurrence: 'quarterly' as CounselingRecurrence,
				color: '#8b5cf6'
			},
			{
				name: 'Event Counseling',
				description: 'Counseling for specific events or incidents',
				recurrence: 'none' as CounselingRecurrence,
				color: '#f59e0b'
			},
			{
				name: 'Freeform',
				description: 'Custom counseling without template',
				recurrence: 'none' as CounselingRecurrence,
				color: '#6b7280',
				isFreeform: true
			}
		];

		defaults.forEach((d, i) => {
			onAdd({
				name: d.name,
				description: d.description,
				templateContent: null,
				templateFilePath: null,
				recurrence: d.recurrence,
				color: d.color,
				isFreeform: d.isFreeform ?? false,
				sortOrder: counselingTypes.length + i
			});
		});
	}
</script>

<TypeManager
	items={counselingTypes}
	title="Manage Counseling Types"
	noun="Counseling Type"
	titleId="counseling-types-title"
	width="650px"
	{onAdd}
	{onUpdate}
	{onRemove}
	{onClose}
	getAddData={() =>
		newName.trim()
			? {
					name: newName.trim(),
					description: newDescription.trim() || null,
					templateContent: newTemplateContent.trim() || null,
					templateFilePath: newTemplateFilePath,
					recurrence: newRecurrence,
					color: newColor,
					isFreeform: newIsFreeform,
					sortOrder: counselingTypes.length
				}
			: null}
	resetAddForm={() => {
		newName = '';
		newDescription = '';
		newTemplateContent = '';
		newTemplateFilePath = null;
		newUploadId = crypto.randomUUID();
		newRecurrence = 'none';
		newColor = '#8b5cf6';
		newIsFreeform = false;
	}}
	onEditStart={(t) => {
		editingTypeId = t.id;
		editName = t.name;
		editDescription = t.description ?? '';
		editTemplateContent = t.templateContent ?? '';
		editTemplateFilePath = t.templateFilePath ?? null;
		editRecurrence = t.recurrence;
		editColor = t.color;
		editIsFreeform = t.isFreeform;
	}}
	getEditData={() =>
		editName.trim()
			? {
					name: editName.trim(),
					description: editDescription.trim() || null,
					templateContent: editTemplateContent.trim() || null,
					templateFilePath: editTemplateFilePath,
					recurrence: editRecurrence,
					color: editColor,
					isFreeform: editIsFreeform
				}
			: null}
	removeConfirmMessage={(t) =>
		`Remove "${t.name}"? Existing counseling records will keep their data but lose the type reference.`}
>
	{#snippet addForm()}
		<div class="counseling-form">
			<div class="form-row">
				<div class="form-group flex-1">
					<label class="label">Name</label>
					<input type="text" class="input" bind:value={newName} placeholder="e.g., Monthly Counseling" />
				</div>
				<div class="form-group">
					<label class="label">Color</label>
					<input type="color" class="color-input" bind:value={newColor} />
				</div>
			</div>

			<div class="form-group">
				<label class="label">Description (optional)</label>
				<input type="text" class="input" bind:value={newDescription} placeholder="Brief description..." />
			</div>

			<div class="form-row">
				<div class="form-group flex-1">
					<label class="label">Recurrence</label>
					<select class="select" bind:value={newRecurrence}>
						{#each Object.entries(COUNSELING_RECURRENCE_LABELS) as [value, label]}
							<option {value}>{label}</option>
						{/each}
					</select>
				</div>
				<div class="form-group">
					<label class="label">&nbsp;</label>
					<label class="checkbox-label">
						<input type="checkbox" bind:checked={newIsFreeform} />
						Freeform (no template)
					</label>
				</div>
			</div>

			{#if !newIsFreeform}
				<div class="form-group">
					<label class="label">Template Content (Markdown)</label>
					<textarea
						class="input textarea"
						bind:value={newTemplateContent}
						placeholder="## Purpose of Counseling&#10;&#10;## Key Points&#10;&#10;## Plan of Action"
						rows="4"
					></textarea>
				</div>
				<FileUpload
					filePath={newTemplateFilePath}
					{orgId}
					storagePath="templates/{newUploadId}"
					onUpload={(path) => (newTemplateFilePath = path)}
					onRemove={() => (newTemplateFilePath = null)}
					label="Template PDF (optional)"
				/>
			{/if}

			{#if counselingTypes.length === 0}
				<div class="default-types-hint">
					<button class="btn btn-secondary btn-sm" onclick={addDefaultTypes}>Add Default Types</button>
				</div>
			{/if}
		</div>
	{/snippet}

	{#snippet itemDisplay(type)}
		<Badge label={type.name} color={type.color} />
		{#if type.recurrence !== 'none'}
			<span class="type-meta">{COUNSELING_RECURRENCE_LABELS[type.recurrence]}</span>
		{/if}
		{#if type.isFreeform}
			<Badge label="Freeform" variant="outlined" />
		{/if}
		{#if type.templateContent || type.templateFilePath}
			<span class="type-meta">Has template</span>
		{/if}
	{/snippet}

	{#snippet editForm()}
		<div class="counseling-form">
			<div class="form-row">
				<div class="form-group flex-1">
					<label class="label">Name</label>
					<input type="text" class="input" bind:value={editName} />
				</div>
				<div class="form-group">
					<label class="label">Color</label>
					<input type="color" class="color-input" bind:value={editColor} />
				</div>
			</div>

			<div class="form-group">
				<label class="label">Description</label>
				<input type="text" class="input" bind:value={editDescription} />
			</div>

			<div class="form-row">
				<div class="form-group flex-1">
					<label class="label">Recurrence</label>
					<select class="select" bind:value={editRecurrence}>
						{#each Object.entries(COUNSELING_RECURRENCE_LABELS) as [value, label]}
							<option {value}>{label}</option>
						{/each}
					</select>
				</div>
				<div class="form-group">
					<label class="label">&nbsp;</label>
					<label class="checkbox-label">
						<input type="checkbox" bind:checked={editIsFreeform} />
						Freeform
					</label>
				</div>
			</div>

			{#if !editIsFreeform}
				<div class="form-group">
					<label class="label">Template Content</label>
					<textarea class="input textarea" bind:value={editTemplateContent} rows="3"></textarea>
				</div>
				<FileUpload
					filePath={editTemplateFilePath}
					{orgId}
					storagePath="templates/{editingTypeId}"
					onUpload={(path) => (editTemplateFilePath = path)}
					onRemove={() => (editTemplateFilePath = null)}
					label="Template PDF (optional)"
				/>
			{/if}
		</div>
	{/snippet}
</TypeManager>

<style>
	.counseling-form {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm);
		width: 100%;
	}

	.form-row {
		display: flex;
		gap: var(--spacing-md);
	}

	.form-group {
		margin-bottom: 0;
	}

	.form-group.flex-1 {
		flex: 1;
	}

	.color-input {
		width: 40px;
		height: 40px;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		cursor: pointer;
		padding: 0;
	}

	.checkbox-label {
		padding: var(--spacing-xs) 0;
	}

	.textarea {
		resize: vertical;
		min-height: 60px;
		font-family: monospace;
	}

	.type-meta {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
	}

	.default-types-hint {
		margin-top: var(--spacing-sm);
	}
</style>
