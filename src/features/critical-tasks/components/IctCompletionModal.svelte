<script lang="ts">
	import Modal from '$lib/components/Modal.svelte';
	import FormField from '$lib/components/ui/FormField.svelte';
	import SearchSelect from '$lib/components/ui/SearchSelect.svelte';
	import { toastStore } from '$lib/stores/toast.svelte';
	import {
		ICT_VALIDATION_METHODS,
		type CriticalTasksSettingsInput,
		type IctTask,
		type PersonnelIctCompletion
	} from '$features/critical-tasks/criticalTasks.types';
	import { calculateIctExpirationDate } from '$features/critical-tasks/utils/ictStatus';
	import { isIctTaskApplicableToMos } from '$features/critical-tasks/utils/ictTaskLibrary';
	import type { Personnel } from '$lib/types';

	type CompletionSaveData = Omit<PersonnelIctCompletion, 'id' | 'loggedBy' | 'createdAt'>;

	interface Props {
		person?: Personnel | null;
		task?: IctTask | null;
		personnelOptions?: Personnel[];
		taskOptions?: IctTask[];
		completions?: PersonnelIctCompletion[];
		existingCompletion?: PersonnelIctCompletion;
		settings?: CriticalTasksSettingsInput | null;
		currentUserDisplayName?: string | null;
		onSave: (data: CompletionSaveData, existingId?: string) => void | Promise<void>;
		onClose: () => void;
	}

	let {
		person = null,
		task = null,
		personnelOptions = [],
		taskOptions = [],
		completions = [],
		existingCompletion,
		settings = null,
		currentUserDisplayName = null,
		onSave,
		onClose
	}: Props = $props();

	let selectedPersonnelId = $state('');
	let selectedTaskId = $state('');
	let completionDate = $state('');
	let validationMethod = $state('');
	let validatedBy = $state('');
	let notes = $state('');
	let useCurrentValidator = $state(false);
	let personError = $state('');
	let taskError = $state('');
	let completionDateError = $state('');
	let validationMethodError = $state('');
	let isSaving = $state(false);

	const methodOptions = [
		{ value: '', label: 'Select validation method' },
		...ICT_VALIDATION_METHODS.map((method) => ({ value: method, label: method }))
	];

	const selectorMode = $derived(!person || !task);
	const selectedPerson = $derived(
		person ?? personnelOptions.find((option) => option.id === selectedPersonnelId) ?? null
	);
	const taskCandidates = $derived(
		selectedPerson ? taskOptions.filter((option) => isIctTaskApplicableToMos(option, selectedPerson.mos)) : taskOptions
	);
	const selectedTask = $derived(task ?? taskCandidates.find((option) => option.id === selectedTaskId) ?? null);
	const personnelSelectOptions = $derived(
		[...personnelOptions]
			.sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName))
			.map((option) => ({
				value: option.id,
				label: `${option.rank} ${option.lastName}, ${option.firstName}${option.mos ? ` - ${option.mos}` : ''}`
			}))
	);
	const taskSelectOptions = $derived(
		[...taskCandidates]
			.sort((a, b) => a.sortOrder - b.sortOrder || a.taskCode.localeCompare(b.taskCode))
			.map((option) => ({
				value: option.id,
				label: `${option.taskCode} ${option.title}`
			}))
	);
	const selectionHint = $derived(
		selectedPerson ? 'Showing tasks applicable to this person.' : 'Select a person to narrow tasks by MOS.'
	);
	const activeExistingCompletion = $derived.by(() => {
		if (existingCompletion) return existingCompletion;
		if (!selectedPerson || !selectedTask) return undefined;

		let latest: PersonnelIctCompletion | undefined;
		for (const completion of completions) {
			if (completion.personnelId !== selectedPerson.id || completion.ictTaskId !== selectedTask.id) continue;
			if (!latest || compareCompletionRecency(latest, completion) < 0) {
				latest = completion;
			}
		}

		return latest;
	});
	const modalTitle = $derived(activeExistingCompletion ? 'Edit ICT Completion' : 'Log ICT Completion');
	const previewExpirationDate = $derived(
		selectedTask ? calculateIctExpirationDate(completionDate || null, selectedTask, settings) : null
	);

	function compareCompletionRecency(a: PersonnelIctCompletion, b: PersonnelIctCompletion): number {
		const completedAtDiff = a.completedAt.localeCompare(b.completedAt);
		if (completedAtDiff !== 0) return completedAtDiff;
		return a.createdAt.localeCompare(b.createdAt);
	}

	$effect(() => {
		if (person?.id && selectedPersonnelId !== person.id) {
			selectedPersonnelId = person.id;
		}
	});

	$effect(() => {
		if (task?.id && selectedTaskId !== task.id) {
			selectedTaskId = task.id;
		}
	});

	$effect(() => {
		if (!person && selectedPersonnelId && !personnelOptions.some((option) => option.id === selectedPersonnelId)) {
			selectedPersonnelId = '';
		}
	});

	$effect(() => {
		if (!task && selectedTaskId && !taskCandidates.some((option) => option.id === selectedTaskId)) {
			selectedTaskId = '';
		}
	});

	$effect(() => {
		const selectedPairKey = `${selectedPerson?.id ?? ''}:${selectedTask?.id ?? ''}`;
		const completion = activeExistingCompletion;
		const existingValidatedBy = completion?.validatedBy ?? '';

		completionDate = selectedPairKey === ':' ? '' : (completion?.completedAt ?? '');
		validationMethod = selectedPairKey === ':' ? '' : (completion?.validationMethod ?? '');
		validatedBy = existingValidatedBy;
		notes = selectedPairKey === ':' ? '' : (completion?.notes ?? '');
		useCurrentValidator = !!currentUserDisplayName && existingValidatedBy === currentUserDisplayName;
		personError = '';
		taskError = '';
		completionDateError = '';
		validationMethodError = '';
	});

	$effect(() => {
		if (!currentUserDisplayName) return;
		if (useCurrentValidator) {
			validatedBy = currentUserDisplayName;
		}
	});

	function resetErrors(): void {
		personError = '';
		taskError = '';
		completionDateError = '';
		validationMethodError = '';
	}

	function validate(): boolean {
		resetErrors();

		if (!selectedPerson) {
			personError = 'Person is required';
		}

		if (!selectedTask) {
			taskError = 'Critical task is required';
		}

		if (!completionDate) {
			completionDateError = 'Completion date is required';
		}

		if (!validationMethod) {
			validationMethodError = 'Validation method is required';
		}

		return !personError && !taskError && !completionDateError && !validationMethodError;
	}

	function getErrorMessage(error: unknown): string {
		if (error instanceof Error && error.message.trim()) return error.message;
		return activeExistingCompletion ? 'Failed to update ICT completion' : 'Failed to save ICT completion';
	}

	function handleValidatorToggle(): void {
		if (!currentUserDisplayName) return;
		if (!useCurrentValidator && validatedBy === currentUserDisplayName) {
			validatedBy = '';
		}
	}

	async function handleSave(): Promise<void> {
		if (isSaving || !validate() || !selectedPerson || !selectedTask) return;

		isSaving = true;
		try {
			await onSave(
				{
					personnelId: selectedPerson.id,
					ictTaskId: selectedTask.id,
					completedAt: completionDate,
					validationMethod: validationMethod as PersonnelIctCompletion['validationMethod'],
					validatedBy: validatedBy.trim() || null,
					notes: notes.trim() || null
				},
				activeExistingCompletion?.id
			);
			toastStore.success(activeExistingCompletion ? 'ICT completion updated' : 'ICT completion saved');
			onClose();
		} catch (error) {
			toastStore.error(getErrorMessage(error));
		} finally {
			isSaving = false;
		}
	}
</script>

<Modal title={modalTitle} {onClose} canClose={!isSaving} width="520px" titleId="ict-completion-title">
	{#if selectorMode}
		<div class="selector-grid">
			<FormField label="Person" id="ict-person-select" required error={personError}>
				<SearchSelect
					id="ict-person-select"
					options={personnelSelectOptions}
					bind:value={selectedPersonnelId}
					placeholder="Search personnel..."
					ariaLabel="Person"
					clearable={false}
				/>
			</FormField>

			<FormField label="Critical Task" id="ict-task-select" required error={taskError} hint={selectionHint}>
				<SearchSelect
					id="ict-task-select"
					options={taskSelectOptions}
					bind:value={selectedTaskId}
					placeholder="Search task or title..."
					ariaLabel="Critical Task"
					clearable={false}
				/>
			</FormField>
		</div>
	{:else if selectedPerson && selectedTask}
		<div class="completion-subject">
			<span class="subject-rank">{selectedPerson.rank}</span>
			<span class="subject-name">{selectedPerson.lastName}, {selectedPerson.firstName}</span>
			<span class="subject-task">{selectedTask.taskCode} {selectedTask.title}</span>
		</div>
	{/if}

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
		<span class="preview-value">
			{#if !selectedTask}
				Select a critical task to calculate expiration
			{:else}
				{previewExpirationDate ?? 'Set completion date to calculate expiration'}
			{/if}
		</span>
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

	.selector-grid {
		display: grid;
		grid-template-columns: 1fr;
		gap: var(--sp-3);
		margin-bottom: var(--sp-4);
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
