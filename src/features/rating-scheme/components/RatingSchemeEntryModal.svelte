<script lang="ts">
	import type { PersonnelLookup } from '$lib/types';
	import type { RatingSchemeEntry, ReportType, WorkflowStatus } from '../rating-scheme.types';
	import {
		applyRatedPersonToNewRatingSchemeEntryDraft,
		buildRatingSchemeEntrySaveData,
		createRatingSchemeEntryDraft,
		getRatingSchemeEntryDraftView,
		removeIntermediateRaterFromDraft,
		removeReviewerFromDraft,
		removeWorkflowFromDraft,
		type RatingSchemeEntryEvalType,
		type RatingSchemeEntryStatus,
		syncAnnualThruDateForRatingSchemeEntryDraft,
		syncReportTypeForRatingSchemeEntryDraft
	} from '$features/rating-scheme/utils/ratingSchemeEntryDraft';
	import * as Alert from '$lib/components/ui/alert';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
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
		onSave: (data: Omit<RatingSchemeEntry, 'id'>) => Promise<void>;
		onDelete?: (id: string) => Promise<void>;
		onClose: () => void;
	}

	let { entry, personnel, onSave, onDelete, onClose }: Props = $props();

	const sortedPersonnel = $derived(
		[...personnel].sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName))
	);
	const personnelOptions = $derived(sortedPersonnel.map((p) => ({ value: p.id, label: formatPersonLabel(p) })));

	function createInitialDraft() {
		return createRatingSchemeEntryDraft(entry);
	}

	let draft = $state(createInitialDraft());
	let showDeleteConfirm = $state(false);
	let saveAttempted = $state(false);
	let isSaving = $state(false);

	const view = $derived(getRatingSchemeEntryDraftView(draft));

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

	function getSaveErrorMessage(error: unknown): string {
		if (error instanceof Error && error.message.trim()) return error.message;
		return entry ? 'Failed to update rating entry' : 'Failed to add rating entry';
	}

	async function handleSave() {
		saveAttempted = true;
		if (!view.canSave || isSaving) return;

		isSaving = true;
		try {
			await onSave(buildRatingSchemeEntrySaveData(draft));
			toastStore.success(entry ? 'Rating entry updated' : 'Rating entry added');
			onClose();
		} catch (error) {
			toastStore.error(getSaveErrorMessage(error));
		} finally {
			isSaving = false;
		}
	}

	async function handleDelete() {
		const deleteHandler = onDelete;
		if (!entry || typeof deleteHandler !== 'function') return;
		await deleteHandler(entry.id);
		onClose();
	}

	function formatPersonLabel(p: PersonnelLookup): string {
		return `${p.rank} ${p.lastName}, ${p.firstName}`;
	}
</script>

<AppDialog.Root open closeBlocked={isSaving} {onClose}>
	<AppDialog.Content size="wide" closeBlocked={isSaving} class="h-[calc(100dvh-2rem)]">
		<AppDialog.Header>
			<AppDialog.Title>{entry ? 'Edit Rating Entry' : 'Add Rating Entry'}</AppDialog.Title>
			<AppDialog.Description
				>Maintain evaluator relationships, period dates, and workflow tracking.</AppDialog.Description
			>
		</AppDialog.Header>

		<AppDialog.Body class="grid min-h-0 gap-4 overflow-y-auto">
			{#if saveAttempted && view.missingRequiredLabels.length > 0}
				<Alert.Root variant="warning">
					<Alert.Title>Complete required fields</Alert.Title>
					<Alert.Description>Missing: {view.missingRequiredLabels.join(', ')}.</Alert.Description>
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
			</Field.Root>

			<div class="grid gap-4 sm:grid-cols-2">
				<Field.Root>
					<Field.Label for="eval-type">Evaluation Type</Field.Label>
					<Select.Root
						type="single"
						value={draft.evalType}
						onValueChange={(value) => handleEvalTypeValueChange(value as string)}
					>
						<Select.Trigger id="eval-type" class="w-full">{view.evalTypeLabel}</Select.Trigger>
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
						variant={draft.rater.mode === 'internal' ? 'secondary' : 'outline'}
						aria-pressed={draft.rater.mode === 'internal'}
						onclick={() => (draft.rater.mode = 'internal')}>From Org</Button
					>
					<Button
						variant={draft.rater.mode === 'external' ? 'secondary' : 'outline'}
						aria-pressed={draft.rater.mode === 'external'}
						onclick={() => (draft.rater.mode = 'external')}>External</Button
					>
				</ButtonGroup.Root>
				{#if draft.rater.mode === 'internal'}
					<Combobox.Root
						items={personnelOptions}
						bind:value={draft.rater.personId}
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
				{:else}
					<Input type="text" bind:value={draft.rater.name} placeholder="Rank, Name, Position (e.g., MAJ Smith, S3)" />
				{/if}
			</Field.Set>

			<Field.Set class="rounded-lg border bg-muted/20 p-4">
				<Field.Legend>Senior Rater *</Field.Legend>
				<ButtonGroup.Root aria-label="Senior rater source">
					<Button
						variant={draft.seniorRater.mode === 'internal' ? 'secondary' : 'outline'}
						aria-pressed={draft.seniorRater.mode === 'internal'}
						onclick={() => (draft.seniorRater.mode = 'internal')}>From Org</Button
					>
					<Button
						variant={draft.seniorRater.mode === 'external' ? 'secondary' : 'outline'}
						aria-pressed={draft.seniorRater.mode === 'external'}
						onclick={() => (draft.seniorRater.mode = 'external')}>External</Button
					>
				</ButtonGroup.Root>
				{#if draft.seniorRater.mode === 'internal'}
					<Combobox.Root
						items={personnelOptions}
						bind:value={draft.seniorRater.personId}
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
				{:else}
					<Input
						type="text"
						bind:value={draft.seniorRater.name}
						placeholder="Rank, Name, Position (e.g., COL Jones, BDE CDR)"
					/>
				{/if}
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
							variant={draft.intermediateRater.mode === 'internal' ? 'secondary' : 'outline'}
							aria-pressed={draft.intermediateRater.mode === 'internal'}
							onclick={() => (draft.intermediateRater.mode = 'internal')}>From Org</Button
						>
						<Button
							variant={draft.intermediateRater.mode === 'external' ? 'secondary' : 'outline'}
							aria-pressed={draft.intermediateRater.mode === 'external'}
							onclick={() => (draft.intermediateRater.mode = 'external')}>External</Button
						>
					</ButtonGroup.Root>
					{#if draft.intermediateRater.mode === 'internal'}
						<Combobox.Root
							items={personnelOptions}
							bind:value={draft.intermediateRater.personId}
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
					{:else}
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
							variant={draft.reviewer.mode === 'internal' ? 'secondary' : 'outline'}
							aria-pressed={draft.reviewer.mode === 'internal'}
							onclick={() => (draft.reviewer.mode = 'internal')}>From Org</Button
						>
						<Button
							variant={draft.reviewer.mode === 'external' ? 'secondary' : 'outline'}
							aria-pressed={draft.reviewer.mode === 'external'}
							onclick={() => (draft.reviewer.mode = 'external')}>External</Button
						>
					</ButtonGroup.Root>
					{#if draft.reviewer.mode === 'internal'}
						<Combobox.Root
							items={personnelOptions}
							bind:value={draft.reviewer.personId}
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
					{:else}
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
				</Field.Root>
				<Field.Root>
					<Field.Label for="period-end">Thru Date (Due)</Field.Label>
					<DatePicker
						id="period-end"
						value={draft.ratingPeriodEnd}
						placeholder="Select thru date"
						onValueChange={handleRatingPeriodEndChange}
					/>
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
					<Select.Trigger id="entry-status" class="w-full">{view.statusLabel}</Select.Trigger>
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
						<Field.Legend>Workflow Status</Field.Legend>
						<Button variant="destructive" size="sm" onclick={() => removeWorkflowFromDraft(draft)}>Remove</Button>
					</div>
					<Select.Root
						type="single"
						value={draft.workflowStatus}
						onValueChange={(value) => handleWorkflowStatusValueChange(value as string)}
					>
						<Select.Trigger id="workflow-status" class="w-full">{view.workflowStatusLabel}</Select.Trigger>
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
		</AppDialog.Body>

		<AppDialog.Footer>
			{#if entry && onDelete}
				<Button variant="destructive" onclick={() => (showDeleteConfirm = true)}>Delete</Button>
			{/if}
			<Button variant="outline" onclick={onClose} disabled={isSaving}>Cancel</Button>
			<Button disabled={isSaving} onclick={handleSave}>{isSaving ? 'Saving...' : 'Save'}</Button>
		</AppDialog.Footer>
	</AppDialog.Content>
</AppDialog.Root>

<AlertDialog.Root open={showDeleteConfirm} onOpenChange={(open) => (showDeleteConfirm = open)}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Delete this entry?</AlertDialog.Title>
			<AlertDialog.Description>
				This removes the rating scheme entry. Continue only if this evaluation record should no longer be tracked.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<Button variant="outline" onclick={() => (showDeleteConfirm = false)}>Cancel</Button>
			<Button variant="destructive" onclick={handleDelete}>Delete Entry</Button>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
