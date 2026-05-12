<script lang="ts">
	import * as AppDialog from '$lib/components/ui/app-dialog';
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { DatePicker } from '$lib/components/ui/date-picker';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import * as NativeSelect from '$lib/components/ui/native-select';
	import SearchCombobox from '$lib/components/ui/SearchCombobox.svelte';
	import { Textarea } from '$lib/components/ui/textarea';
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

	const selectedPerson = $derived(
		person ?? personnelOptions.find((option) => option.id === selectedPersonnelId) ?? null
	);
	const showPersonnelSelect = $derived(!person);
	const showTaskSelect = $derived(!task);
	const selectorMode = $derived(showPersonnelSelect || showTaskSelect);
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

<AppDialog.Root open onClose={() => !isSaving && onClose()}>
	<AppDialog.Content class="sm:max-w-xl">
		<AppDialog.Header>
			<AppDialog.Title id="ict-completion-title">{modalTitle}</AppDialog.Title>
		</AppDialog.Header>

		<AppDialog.Body class="space-y-4">
			{#if selectorMode}
				{#if selectedPerson && !showPersonnelSelect}
					<div class="rounded-lg border bg-muted/30 p-3">
						<p class="font-mono text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
							{selectedPerson.rank}
						</p>
						<p class="text-sm font-semibold text-foreground">{selectedPerson.lastName}, {selectedPerson.firstName}</p>
						<p class="font-mono text-xs uppercase tracking-[0.08em] text-muted-foreground">
							{selectedPerson.mos || 'No MOS'}
						</p>
					</div>
				{/if}

				<div class="grid gap-3">
					{#if showPersonnelSelect}
						<Field.Root>
							<Field.Label for="ict-person-select">Person</Field.Label>
							<SearchCombobox
								id="ict-person-select"
								options={personnelSelectOptions}
								bind:value={selectedPersonnelId}
								placeholder="Search personnel..."
								ariaLabel="Person"
								clearable={false}
							/>
							{#if personError}
								<Field.Error>{personError}</Field.Error>
							{/if}
						</Field.Root>
					{/if}

					{#if showTaskSelect}
						<Field.Root>
							<Field.Label for="ict-task-select">Critical Task</Field.Label>
							<SearchCombobox
								id="ict-task-select"
								options={taskSelectOptions}
								bind:value={selectedTaskId}
								placeholder="Search task or title..."
								ariaLabel="Critical Task"
								clearable={false}
							/>
							<Field.Description>{selectionHint}</Field.Description>
							{#if taskError}
								<Field.Error>{taskError}</Field.Error>
							{/if}
						</Field.Root>
					{/if}
				</div>
			{:else if selectedPerson && selectedTask}
				<div class="rounded-lg border bg-muted/30 p-3">
					<p class="font-mono text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
						{selectedPerson.rank}
					</p>
					<p class="text-sm font-semibold text-foreground">{selectedPerson.lastName}, {selectedPerson.firstName}</p>
					<p class="font-mono text-xs uppercase tracking-[0.08em] text-muted-foreground">
						{selectedTask.taskCode}
						{selectedTask.title}
					</p>
				</div>
			{/if}

			<div class="grid gap-3 sm:grid-cols-2">
				<Field.Root>
					<Field.Label for="ict-completion-date">Completion Date</Field.Label>
					<DatePicker id="ict-completion-date" bind:value={completionDate} aria-label="Completion Date" />
					{#if completionDateError}
						<Field.Error>{completionDateError}</Field.Error>
					{/if}
				</Field.Root>

				<Field.Root>
					<Field.Label for="ict-validation-method">Validation Method</Field.Label>
					<NativeSelect.Root id="ict-validation-method" bind:value={validationMethod} aria-label="Validation Method">
						{#each methodOptions as option (option.value)}
							<NativeSelect.Option value={option.value}>{option.label}</NativeSelect.Option>
						{/each}
					</NativeSelect.Root>
					{#if validationMethodError}
						<Field.Error>{validationMethodError}</Field.Error>
					{/if}
				</Field.Root>
			</div>

			{#if currentUserDisplayName}
				<Field.Label class="flex-row items-center">
					<Checkbox bind:checked={useCurrentValidator} onchange={handleValidatorToggle} />
					<span>I am the validator</span>
				</Field.Label>
			{/if}

			<Field.Root>
				<Field.Label for="ict-validated-by">Validated By</Field.Label>
				<Input id="ict-validated-by" bind:value={validatedBy} />
				<Field.Description>Optional rank and name of the validator</Field.Description>
			</Field.Root>

			<div class="rounded-lg border bg-muted/30 p-3" aria-label="Calculated expiration date">
				<p class="font-mono text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Expiration Date</p>
				<p class="text-sm text-foreground">
					{#if !selectedTask}
						Select a critical task to calculate expiration
					{:else}
						{previewExpirationDate ?? 'Set completion date to calculate expiration'}
					{/if}
				</p>
			</div>

			<Field.Root>
				<Field.Label for="ict-notes">Notes (optional)</Field.Label>
				<Textarea id="ict-notes" rows={3} bind:value={notes} />
			</Field.Root>
		</AppDialog.Body>

		<AppDialog.Footer>
			<Button variant="outline" type="button" onclick={onClose} disabled={isSaving}>Cancel</Button>
			<Button type="button" data-testid="ict-completion-save" onclick={handleSave} disabled={isSaving}>
				{isSaving ? 'Saving...' : 'Save'}
			</Button>
		</AppDialog.Footer>
	</AppDialog.Content>
</AppDialog.Root>
