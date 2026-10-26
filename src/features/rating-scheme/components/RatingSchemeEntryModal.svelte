<script lang="ts">
	import { onDestroy, tick } from 'svelte';
	import type { PersonnelLookup } from '$features/personnel/contracts';
	import type { RatingSchemeEntry, ReportType, WorkflowStatus } from '../rating-scheme.types';
	import {
		applyRatedPersonToNewRatingSchemeEntryDraft,
		buildRatingSchemeEntrySaveData,
		createRatingSchemeEntryDraft,
		getRatingSchemeEntryDraftView,
		removeIntermediateRaterFromDraft,
		removeReviewerFromDraft,
		removeWorkflowFromDraft,
		setEvaluatorFromPicker,
		type RatingSchemeRequiredField,
		type RatingSchemeEntryEvalType,
		type RatingSchemeEntryStatus,
		syncAnnualThruDateForRatingSchemeEntryDraft,
		syncReportTypeForRatingSchemeEntryDraft
	} from '$features/rating-scheme/utils/ratingSchemeEntryDraft';
	import * as Alert from '$lib/components/ui/alert';
	import { ConfirmDialog } from '$lib/components/ui/confirm-dialog';
	import * as AppDialog from '$lib/components/ui/app-dialog';
	import { Button } from '$lib/components/ui/button';
	import * as ButtonGroup from '$lib/components/ui/button-group';
	import * as Combobox from '$lib/components/ui/combobox';
	import { DatePicker } from '$lib/components/ui/date-picker';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import * as Select from '$lib/components/ui/select';
	import { Textarea } from '$lib/components/ui/textarea';
	import { toastStore } from '$lib/stores/toast.svelte';

	interface Props {
		entry: RatingSchemeEntry | null;
		personnel: PersonnelLookup[];
		isCurrentWorkspace: () => boolean;
		onSave: (data: Omit<RatingSchemeEntry, 'id'>, isCurrent: () => boolean) => Promise<void>;
		onDelete?: (id: string, isCurrent: () => boolean) => Promise<boolean>;
		onClose: () => void;
	}

	let { entry, personnel, isCurrentWorkspace, onSave, onDelete, onClose }: Props = $props();
	let disposed = false;
	onDestroy(() => {
		disposed = true;
	});
	const isCurrent = () => !disposed && isCurrentWorkspace();

	const sortedPersonnel = $derived(
		[...personnel].sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName))
	);
	const personnelOptions = $derived(sortedPersonnel.map((p) => ({ value: p.id, label: formatPersonLabel(p) })));

	function createInitialDraft() {
		return createRatingSchemeEntryDraft(entry);
	}

	let draft = $state(createInitialDraft());
	const pristineDraft = JSON.stringify(createInitialDraft());
	let showDeleteConfirm = $state(false);
	let saveAttempted = $state(false);
	let isSaving = $state(false);
	let isDeleting = $state(false);
	let saveError = $state('');
	let saveButton = $state<HTMLButtonElement | null>(null);
	const busy = $derived(isSaving || isDeleting);
	const dirty = $derived(JSON.stringify(draft) !== pristineDraft);

	const view = $derived(getRatingSchemeEntryDraftView(draft));
	const missingRequired = $derived(saveAttempted ? view.missingRequired : []);

	const requiredLabels: Record<RatingSchemeRequiredField, string> = {
		ratedPerson: 'rated individual',
		ratingPeriodStart: 'rating period start',
		ratingPeriodEnd: 'thru date',
		rater: 'rater',
		seniorRater: 'senior rater'
	};

	function handleEvaluatorPersonChange(
		role: 'rater' | 'seniorRater' | 'intermediateRater' | 'reviewer',
		value: string | string[]
	) {
		if (typeof value === 'string') draft[role] = setEvaluatorFromPicker({ personId: value });
	}

	function handleRatedPersonValueChange(value: string | string[]) {
		if (Array.isArray(value)) return;
		draft.ratedPersonId = value;
		applyRatedPersonToNewRatingSchemeEntryDraft(draft, entry, personnel);
		syncReportTypeForRatingSchemeEntryDraft(draft);
		syncAnnualThruDateForRatingSchemeEntryDraft(draft, entry);
	}

	function handleEvalTypeValueChange(value: string) {
		draft.evalType = value as RatingSchemeEntryEvalType;
		syncReportTypeForRatingSchemeEntryDraft(draft);
		syncAnnualThruDateForRatingSchemeEntryDraft(draft, entry);
	}

	function handleReportTypeValueChange(value: string) {
		draft.reportType = (value || '') as ReportType | '';
		syncAnnualThruDateForRatingSchemeEntryDraft(draft, entry);
	}

	function handleRatingPeriodStartChange(value: string) {
		draft.ratingPeriodStart = value;
		syncAnnualThruDateForRatingSchemeEntryDraft(draft, entry);
	}

	function handleRatingPeriodEndChange(value: string) {
		draft.ratingPeriodEnd = value;
		draft.autoFilledEnd = false;
	}

	function handleEntryStatusValueChange(value: string) {
		draft.status = value as RatingSchemeEntryStatus;
	}

	function handleWorkflowStatusValueChange(value: string) {
		draft.workflowStatus = value as WorkflowStatus | '';
	}

	function getSaveErrorMessage(error: unknown, fallback: string): string {
		if (error instanceof Error && error.message.trim()) return error.message;
		return fallback;
	}

	async function handleSave() {
		saveAttempted = true;
		if (!view.canSave || busy || !isCurrent()) return;

		const saveData = buildRatingSchemeEntrySaveData(draft);
		const successMessage = entry ? 'Rating entry updated' : 'Rating entry added';
		const failureMessage = entry ? 'Failed to update rating entry' : 'Failed to add rating entry';
		saveError = '';
		isSaving = true;
		try {
			await onSave(saveData, isCurrent);
			if (!isCurrent()) return;
			toastStore.success(successMessage);
			onClose();
		} catch (error) {
			if (isCurrent()) saveError = getSaveErrorMessage(error, failureMessage);
		} finally {
			if (isCurrent()) isSaving = false;
		}
		if (saveError && isCurrent()) {
			await tick();
			saveButton?.focus();
		}
	}

	async function handleDelete() {
		const deleteHandler = onDelete;
		if (!entry || typeof deleteHandler !== 'function' || busy || !isCurrent()) return;
		const entryId = entry.id;
		isDeleting = true;
		try {
			const deleted = await deleteHandler(entryId, isCurrent);
			if (isCurrent() && deleted) onClose();
		} catch {
			if (isCurrent()) toastStore.error('Failed to delete rating entry. Try again.');
		} finally {
			if (isCurrent()) isDeleting = false;
		}
	}

	function formatPersonLabel(p: PersonnelLookup): string {
		return `${p.rank} ${p.lastName}, ${p.firstName}`;
	}
</script>

{#snippet requiredError(missingLabel: RatingSchemeRequiredField, fieldName: string)}
	{#if missingRequired.includes(missingLabel)}<Field.Error>{fieldName} is required.</Field.Error>{/if}
{/snippet}

<AppDialog.Root open {busy} closeBlocked={dirty} {onClose}>
	<AppDialog.Content size="wide" class="h-[calc(100dvh-2rem)]">
		<AppDialog.Header>
			<AppDialog.Title>{entry ? 'Edit Rating Entry' : 'Add Rating Entry'}</AppDialog.Title>
			<AppDialog.Description
				>Maintain evaluator relationships, period dates, and workflow tracking.</AppDialog.Description
			>
		</AppDialog.Header>

		<AppDialog.Body class="grid min-h-0 gap-4 overflow-y-auto">
			<fieldset class="contents" disabled={busy}>
				{#if saveError}
					<Alert.Root variant="destructive">
						<Alert.Title>Rating entry was not saved</Alert.Title>
						<Alert.Description>{saveError}</Alert.Description>
					</Alert.Root>
				{/if}
				{#if missingRequired.length > 0}
					<Alert.Root variant="warning">
						<Alert.Title>Complete required fields</Alert.Title>
						<Alert.Description
							>Missing: {view.missingRequired.map((field) => requiredLabels[field]).join(', ')}.</Alert.Description
						>
					</Alert.Root>
				{/if}

				<Field.Root>
					<Field.Label for="rated-individual">Rated Individual</Field.Label>
					<Combobox.Root
						items={personnelOptions}
						bind:value={draft.ratedPersonId}
						disabled={!!entry}
						label="Rated individual"
						autoHighlight
						onValueChange={handleRatedPersonValueChange}
					>
						<Combobox.Trigger
							id="rated-individual"
							clearable
							placeholder="Search personnel..."
							aria-label="Rated individual"
						/>
						<Combobox.Content>
							<Combobox.Search placeholder="Search personnel..." />
							<Combobox.Empty>No personnel found.</Combobox.Empty>
							<Combobox.List />
						</Combobox.Content>
					</Combobox.Root>
					{@render requiredError('ratedPerson', 'Rated individual')}
				</Field.Root>

				<div class="grid gap-4 sm:grid-cols-2">
					<Field.Root>
						<Field.Label for="eval-type">Evaluation Type</Field.Label>
						<Select.Root
							type="single"
							value={draft.evalType}
							onValueChange={(value) => handleEvalTypeValueChange(value as string)}
						>
							<Select.Trigger id="eval-type" class="w-full"
								>{draft.evalType === 'OER'
									? 'OER (Officer)'
									: draft.evalType === 'WOER'
										? 'WOER (Warrant Officer)'
										: 'NCOER (NCO)'}</Select.Trigger
							>
							<Select.Content>
								<Select.Item value="OER" label="OER (Officer)" />
								<Select.Item value="NCOER" label="NCOER (NCO)" />
								<Select.Item value="WOER" label="WOER (Warrant Officer)" />
							</Select.Content>
						</Select.Root>
					</Field.Root>
					<Field.Root>
						<Field.Label for="report-type">Report Type</Field.Label>
						<Select.Root
							type="single"
							value={draft.reportType}
							onValueChange={(value) => handleReportTypeValueChange(value as string)}
						>
							<Select.Trigger id="report-type" class="w-full">{view.reportTypeLabel}</Select.Trigger>
							<Select.Content>
								{#each view.reportTypeOptions as opt (opt.value)}
									<Select.Item value={opt.value} label={`${opt.value} - ${opt.label}`} />
								{/each}
							</Select.Content>
						</Select.Root>
					</Field.Root>
				</div>

				<Field.Set class="rounded-lg border bg-muted/20 p-4">
					<Field.Legend>Rater *</Field.Legend>
					<ButtonGroup.Root aria-label="Rater source">
						<Button
							variant={draft.rater.kind !== 'external' ? 'secondary' : 'outline'}
							aria-pressed={draft.rater.kind !== 'external'}
							onclick={() => {
								if (draft.rater.kind === 'external') draft.rater = { kind: 'empty' };
							}}>From Org</Button
						>
						<Button
							variant={draft.rater.kind === 'external' ? 'secondary' : 'outline'}
							aria-pressed={draft.rater.kind === 'external'}
							onclick={() => {
								if (draft.rater.kind !== 'external') draft.rater = { kind: 'external', name: '' };
							}}>External</Button
						>
					</ButtonGroup.Root>
					<Field.Root>
						{#if draft.rater.kind !== 'external'}
							<Combobox.Root
								items={personnelOptions}
								value={draft.rater.kind === 'person' ? draft.rater.personId : ''}
								onValueChange={(value) => handleEvaluatorPersonChange('rater', value)}
								label="Rater from organization"
								autoHighlight
							>
								<Combobox.Trigger clearable placeholder="Search rater..." aria-label="Rater from organization" />
								<Combobox.Content>
									<Combobox.Search placeholder="Search rater..." />
									<Combobox.Empty>No personnel found.</Combobox.Empty>
									<Combobox.List />
								</Combobox.Content>
							</Combobox.Root>
						{:else if draft.rater.kind === 'external'}
							<Input
								type="text"
								bind:value={draft.rater.name}
								aria-label="External rater"
								placeholder="Rank, Name, Position (e.g., MAJ Smith, S3)"
							/>
						{/if}
						{@render requiredError('rater', 'Rater')}
					</Field.Root>
				</Field.Set>

				<Field.Set class="rounded-lg border bg-muted/20 p-4">
					<Field.Legend>Senior Rater *</Field.Legend>
					<ButtonGroup.Root aria-label="Senior rater source">
						<Button
							variant={draft.seniorRater.kind !== 'external' ? 'secondary' : 'outline'}
							aria-pressed={draft.seniorRater.kind !== 'external'}
							onclick={() => {
								if (draft.seniorRater.kind === 'external') draft.seniorRater = { kind: 'empty' };
							}}>From Org</Button
						>
						<Button
							variant={draft.seniorRater.kind === 'external' ? 'secondary' : 'outline'}
							aria-pressed={draft.seniorRater.kind === 'external'}
							onclick={() => {
								if (draft.seniorRater.kind !== 'external') draft.seniorRater = { kind: 'external', name: '' };
							}}>External</Button
						>
					</ButtonGroup.Root>
					<Field.Root>
						{#if draft.seniorRater.kind !== 'external'}
							<Combobox.Root
								items={personnelOptions}
								value={draft.seniorRater.kind === 'person' ? draft.seniorRater.personId : ''}
								onValueChange={(value) => handleEvaluatorPersonChange('seniorRater', value)}
								label="Senior rater from organization"
								autoHighlight
							>
								<Combobox.Trigger
									clearable
									placeholder="Search senior rater..."
									aria-label="Senior rater from organization"
								/>
								<Combobox.Content>
									<Combobox.Search placeholder="Search senior rater..." />
									<Combobox.Empty>No personnel found.</Combobox.Empty>
									<Combobox.List />
								</Combobox.Content>
							</Combobox.Root>
						{:else if draft.seniorRater.kind === 'external'}
							<Input
								type="text"
								bind:value={draft.seniorRater.name}
								aria-label="External senior rater"
								placeholder="Rank, Name, Position (e.g., COL Jones, BDE CDR)"
							/>
						{/if}
						{@render requiredError('seniorRater', 'Senior rater')}
					</Field.Root>
				</Field.Set>

				{#if !draft.showIntermediate}
					<Button variant="ghost" class="w-fit" onclick={() => (draft.showIntermediate = true)}
						>Add Intermediate Rater</Button
					>
				{:else}
					<Field.Set class="rounded-lg border bg-muted/20 p-4">
						<div class="flex items-center justify-between gap-2">
							<Field.Legend>Intermediate Rater</Field.Legend>
							<Button variant="destructive" size="sm" onclick={() => removeIntermediateRaterFromDraft(draft)}
								>Remove</Button
							>
						</div>
						<ButtonGroup.Root aria-label="Intermediate rater source">
							<Button
								variant={draft.intermediateRater.kind !== 'external' ? 'secondary' : 'outline'}
								aria-pressed={draft.intermediateRater.kind !== 'external'}
								onclick={() => {
									if (draft.intermediateRater.kind === 'external') draft.intermediateRater = { kind: 'empty' };
								}}>From Org</Button
							>
							<Button
								variant={draft.intermediateRater.kind === 'external' ? 'secondary' : 'outline'}
								aria-pressed={draft.intermediateRater.kind === 'external'}
								onclick={() => {
									if (draft.intermediateRater.kind !== 'external')
										draft.intermediateRater = { kind: 'external', name: '' };
								}}>External</Button
							>
						</ButtonGroup.Root>
						{#if draft.intermediateRater.kind !== 'external'}
							<Combobox.Root
								items={personnelOptions}
								value={draft.intermediateRater.kind === 'person' ? draft.intermediateRater.personId : ''}
								onValueChange={(value) => handleEvaluatorPersonChange('intermediateRater', value)}
								label="Intermediate rater from organization"
								autoHighlight
							>
								<Combobox.Trigger
									clearable
									placeholder="Search intermediate rater..."
									aria-label="Intermediate rater from organization"
								/>
								<Combobox.Content>
									<Combobox.Search placeholder="Search intermediate rater..." />
									<Combobox.Empty>No personnel found.</Combobox.Empty>
									<Combobox.List />
								</Combobox.Content>
							</Combobox.Root>
						{:else if draft.intermediateRater.kind === 'external'}
							<Input type="text" bind:value={draft.intermediateRater.name} placeholder="Rank, Name, Position" />
						{/if}
					</Field.Set>
				{/if}

				{#if !draft.showReviewer}
					<Button variant="ghost" class="w-fit" onclick={() => (draft.showReviewer = true)}>Add Reviewer</Button>
				{:else}
					<Field.Set class="rounded-lg border bg-muted/20 p-4">
						<div class="flex items-center justify-between gap-2">
							<Field.Legend>Reviewer</Field.Legend>
							<Button variant="destructive" size="sm" onclick={() => removeReviewerFromDraft(draft)}>Remove</Button>
						</div>
						<ButtonGroup.Root aria-label="Reviewer source">
							<Button
								variant={draft.reviewer.kind !== 'external' ? 'secondary' : 'outline'}
								aria-pressed={draft.reviewer.kind !== 'external'}
								onclick={() => {
									if (draft.reviewer.kind === 'external') draft.reviewer = { kind: 'empty' };
								}}>From Org</Button
							>
							<Button
								variant={draft.reviewer.kind === 'external' ? 'secondary' : 'outline'}
								aria-pressed={draft.reviewer.kind === 'external'}
								onclick={() => {
									if (draft.reviewer.kind !== 'external') draft.reviewer = { kind: 'external', name: '' };
								}}>External</Button
							>
						</ButtonGroup.Root>
						{#if draft.reviewer.kind !== 'external'}
							<Combobox.Root
								items={personnelOptions}
								value={draft.reviewer.kind === 'person' ? draft.reviewer.personId : ''}
								onValueChange={(value) => handleEvaluatorPersonChange('reviewer', value)}
								label="Reviewer from organization"
								autoHighlight
							>
								<Combobox.Trigger clearable placeholder="Search reviewer..." aria-label="Reviewer from organization" />
								<Combobox.Content>
									<Combobox.Search placeholder="Search reviewer..." />
									<Combobox.Empty>No personnel found.</Combobox.Empty>
									<Combobox.List />
								</Combobox.Content>
							</Combobox.Root>
						{:else if draft.reviewer.kind === 'external'}
							<Input type="text" bind:value={draft.reviewer.name} placeholder="Rank, Name, Position" />
						{/if}
					</Field.Set>
				{/if}

				<div class="grid gap-4 sm:grid-cols-2">
					<Field.Root>
						<Field.Label for="period-start">Rating Period Start</Field.Label>
						<DatePicker
							id="period-start"
							value={draft.ratingPeriodStart}
							placeholder="Select start date"
							onValueChange={handleRatingPeriodStartChange}
						/>
						{@render requiredError('ratingPeriodStart', 'Rating period start')}
					</Field.Root>
					<Field.Root>
						<Field.Label for="period-end">Thru Date (Due)</Field.Label>
						<DatePicker
							id="period-end"
							value={draft.ratingPeriodEnd}
							placeholder="Select thru date"
							onValueChange={handleRatingPeriodEndChange}
						/>
						{@render requiredError('ratingPeriodEnd', 'Thru date')}
					</Field.Root>
				</div>

				{#if view.eaWarning}
					<Alert.Root variant="warning">
						<Alert.Description>{view.eaWarning}</Alert.Description>
					</Alert.Root>
				{/if}

				<Field.Root>
					<Field.Label for="entry-status">Status</Field.Label>
					<Select.Root
						type="single"
						value={draft.status}
						onValueChange={(value) => handleEntryStatusValueChange(value as string)}
					>
						<Select.Trigger id="entry-status" class="w-full"
							>{draft.status === 'completed'
								? 'Completed'
								: draft.status === 'change-of-rater'
									? 'Change of Rater'
									: 'Active'}</Select.Trigger
						>
						<Select.Content>
							<Select.Item value="active" label="Active" />
							<Select.Item value="completed" label="Completed" />
							<Select.Item value="change-of-rater" label="Change of Rater" />
						</Select.Content>
					</Select.Root>
				</Field.Root>

				{#if !draft.showWorkflow}
					<Button variant="ghost" class="w-fit" onclick={() => (draft.showWorkflow = true)}>Track Workflow</Button>
				{:else}
					<Field.Set class="rounded-lg border bg-muted/20 p-4">
						<div class="flex items-center justify-between gap-2">
							<Field.Legend id="workflow-status-label">Workflow Status</Field.Legend>
							<Button variant="destructive" size="sm" onclick={() => removeWorkflowFromDraft(draft)}>Remove</Button>
						</div>
						<Select.Root
							type="single"
							value={draft.workflowStatus}
							onValueChange={(value) => handleWorkflowStatusValueChange(value as string)}
						>
							<Select.Trigger id="workflow-status" aria-labelledby="workflow-status-label" class="w-full"
								>{view.workflowStatusLabel}</Select.Trigger
							>
							<Select.Content>
								{#each view.filteredWorkflowOptions as opt (opt.value)}
									<Select.Item value={opt.value} label={opt.label} />
								{/each}
							</Select.Content>
						</Select.Root>
					</Field.Set>
				{/if}

				<Field.Root>
					<Field.Label for="entry-notes">Notes</Field.Label>
					<Textarea id="entry-notes" rows={2} bind:value={draft.notes} placeholder="Optional notes..." />
				</Field.Root>
			</fieldset>
		</AppDialog.Body>

		<AppDialog.Footer>
			{#if entry && onDelete}
				<Button variant="destructive" disabled={busy} onclick={() => (showDeleteConfirm = true)}>Delete</Button>
			{/if}
			<Button variant="outline" onclick={onClose} disabled={busy}>Cancel</Button>
			<Button disabled={busy} onclick={handleSave} bind:ref={saveButton}>{isSaving ? 'Saving...' : 'Save'}</Button>
		</AppDialog.Footer>
	</AppDialog.Content>
</AppDialog.Root>

{#if showDeleteConfirm}
	<ConfirmDialog
		title="Delete this entry?"
		message="This removes the rating scheme entry. Continue only if this evaluation record should no longer be tracked."
		confirmLabel="Delete Entry"
		loading={isDeleting}
		onConfirm={handleDelete}
		onCancel={() => (showDeleteConfirm = false)}
	/>
{/if}
