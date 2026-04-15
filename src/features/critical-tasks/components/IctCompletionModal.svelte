<script lang="ts">
	import Modal from '$lib/components/Modal.svelte';
	import FormField from '$lib/components/ui/FormField.svelte';
	import { toastStore } from '$lib/stores/toast.svelte';
	import {
		ICT_VALIDATION_METHODS,
		type CriticalTasksSettingsInput,
		type IctTask,
		type PersonnelIctCompletion
	} from '$features/critical-tasks/criticalTasks.types';
	import { calculateIctExpirationDate } from '$features/critical-tasks/utils/ictStatus';
	import type { Personnel } from '$lib/types';

	type CompletionSaveData = Omit<PersonnelIctCompletion, 'id' | 'loggedBy' | 'createdAt'>;

	interface Props {
		person: Personnel;
		task: IctTask;
		existingCompletion?: PersonnelIctCompletion;
		settings?: CriticalTasksSettingsInput | null;
		currentUserDisplayName?: string | null;
		onSave: (data: CompletionSaveData, existingId?: string) => void | Promise<void>;
		onClose: () => void;
	}

	let {
		person,
		task,
		existingCompletion,
		settings = null,
		currentUserDisplayName = null,
		onSave,
		onClose
	}: Props = $props();

	let completionDate = $state('');
	let validationMethod = $state('');
	let validatedBy = $state('');
	let notes = $state('');
	let useCurrentValidator = $state(false);
	let completionDateError = $state('');
	let validationMethodError = $state('');
	let isSaving = $state(false);

	const methodOptions = [
		{ value: '', label: 'Select validation method' },
		...ICT_VALIDATION_METHODS.map((method) => ({ value: method, label: method }))
	];

	$effect(() => {
		const existingValidatedBy = existingCompletion?.validatedBy ?? '';
		completionDate = existingCompletion?.completedAt ?? '';
		validationMethod = existingCompletion?.validationMethod ?? '';
		validatedBy = existingValidatedBy;
		notes = existingCompletion?.notes ?? '';
		useCurrentValidator = !!currentUserDisplayName && existingValidatedBy === currentUserDisplayName;
		completionDateError = '';
		validationMethodError = '';
	});

	$effect(() => {
		if (!currentUserDisplayName) return;
		if (useCurrentValidator) {
			validatedBy = currentUserDisplayName;
		}
	});

	const previewExpirationDate = $derived(calculateIctExpirationDate(completionDate || null, task, settings));

	function resetErrors(): void {
		completionDateError = '';
		validationMethodError = '';
	}

	function validate(): boolean {
		resetErrors();

		if (!completionDate) {
			completionDateError = 'Completion date is required';
		}

		if (!validationMethod) {
			validationMethodError = 'Validation method is required';
		}

		return !completionDateError && !validationMethodError;
	}

	function getErrorMessage(error: unknown): string {
		if (error instanceof Error && error.message.trim()) return error.message;
		return existingCompletion ? 'Failed to update ICT completion' : 'Failed to save ICT completion';
	}

	function handleValidatorToggle(): void {
		if (!currentUserDisplayName) return;
		if (!useCurrentValidator && validatedBy === currentUserDisplayName) {
			validatedBy = '';
		}
	}

	async function handleSave(): Promise<void> {
		if (isSaving || !validate()) return;

		isSaving = true;
		try {
			await onSave(
				{
					personnelId: person.id,
					ictTaskId: task.id,
					completedAt: completionDate,
					validationMethod: validationMethod as PersonnelIctCompletion['validationMethod'],
					validatedBy: validatedBy.trim() || null,
					notes: notes.trim() || null
				},
				existingCompletion?.id
			);
			toastStore.success(existingCompletion ? 'ICT completion updated' : 'ICT completion saved');
			onClose();
		} catch (error) {
			toastStore.error(getErrorMessage(error));
		} finally {
			isSaving = false;
		}
	}
</script>

<Modal
	title={existingCompletion ? 'Edit ICT Completion' : 'Log ICT Completion'}
	{onClose}
	canClose={!isSaving}
	width="520px"
	titleId="ict-completion-title"
>
	<div class="completion-subject">
		<span class="subject-rank">{person.rank}</span>
		<span class="subject-name">{person.lastName}, {person.firstName}</span>
		<span class="subject-task">{task.taskCode} {task.title}</span>
	</div>

	<div class="completion-grid">
		<FormField
			label="Completion Date"
			id="ict-completion-date"
			type="date"
			required
			error={completionDateError}
			bind:value={completionDate}
		/>

		<FormField
			label="Validation Method"
			id="ict-validation-method"
			inputElement="select"
			required
			error={validationMethodError}
			options={methodOptions}
			bind:value={validationMethod}
		/>
	</div>

	{#if currentUserDisplayName}
		<label class="validator-toggle">
			<input type="checkbox" bind:checked={useCurrentValidator} onchange={handleValidatorToggle} />
			<span>I am the validator</span>
		</label>
	{/if}

	<FormField
		label="Validated By"
		id="ict-validated-by"
		hint="Optional rank and name of the validator"
		bind:value={validatedBy}
	/>

	<div class="expiration-preview" aria-label="Calculated expiration date">
		<span class="preview-label">Expiration Date</span>
		<span class="preview-value">{previewExpirationDate ?? 'Set completion date to calculate expiration'}</span>
	</div>

	<FormField label="Notes (optional)" id="ict-notes" inputElement="textarea" rows={3} bind:value={notes} />

	{#snippet footer()}
		<div class="spacer"></div>
		<button class="btn btn-secondary" type="button" onclick={onClose} disabled={isSaving}>Cancel</button>
		<button
			class="btn btn-primary"
			type="button"
			data-testid="ict-completion-save"
			onclick={handleSave}
			disabled={isSaving}
		>
			{isSaving ? 'Saving...' : 'Save'}
		</button>
	{/snippet}
</Modal>

<style>
	.completion-subject {
		display: flex;
		flex-direction: column;
		gap: var(--sp-1);
		margin-bottom: var(--sp-4);
		padding: var(--sp-3);
		border: var(--border-thin);
		border-radius: var(--radius-md);
		background: color-mix(in srgb, var(--surface-subtle) 58%, var(--surface-panel) 42%);
	}

	.subject-rank,
	.subject-task,
	.preview-label,
	.validator-toggle {
		color: var(--text-secondary);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: var(--letter-spacing-mono);
		text-transform: uppercase;
	}

	.subject-name {
		color: var(--text-primary);
		font-size: var(--text-sm);
		font-weight: var(--font-weight-semibold);
	}

	.completion-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--sp-3);
		margin-bottom: var(--sp-3);
	}

	.validator-toggle {
		display: inline-flex;
		align-items: center;
		gap: var(--sp-2);
		margin-bottom: var(--sp-3);
		cursor: pointer;
	}

	.validator-toggle input {
		width: 1rem;
		height: 1rem;
	}

	.expiration-preview {
		display: flex;
		flex-direction: column;
		gap: var(--sp-1);
		margin: var(--sp-3) 0;
		padding: var(--sp-3);
		border: var(--border-thin);
		border-radius: var(--radius-md);
		background: var(--surface-panel);
	}

	.preview-value {
		color: var(--text-primary);
		font-size: var(--text-sm);
		font-weight: var(--font-weight-semibold);
	}

	.spacer {
		flex: 1;
	}

	@media (max-width: 640px) {
		.completion-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
