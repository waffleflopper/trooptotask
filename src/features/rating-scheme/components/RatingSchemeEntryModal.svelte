<script lang="ts">
	import { onDestroy, tick } from 'svelte';
	import type { PersonnelLookup } from '$features/personnel/contracts';
	import type { RatingSchemeEntry, ReportType, WorkflowStatus } from '../rating-scheme.types';
	import type { RatingSchemeRaterChange } from '../contracts';
	import {
		applyRatedPersonToNewRatingSchemeEntryDraft,
		buildRatingSchemeEntrySaveData,
		createRatingSchemeEntryDraft,
		getRatingSchemeEntryDraftView,
		removeIntermediateRaterFromDraft,
		removeReviewerFromDraft,
		type EvaluatorDraft,
		type RatingSchemeEntrySaveData,
		type RatingSchemeRequiredField,
		type RatingSchemeEntryEvalType,
		syncAnnualThruDateForRatingSchemeEntryDraft,
		syncReportTypeForRatingSchemeEntryDraft
	} from '$features/rating-scheme/utils/ratingSchemeEntryDraft';
	import XIcon from '@lucide/svelte/icons/x';
	import { getDaysUntilDue, getRatingDueLabel } from '../utils/ratingScheme';
	import {
		EVALUATION_PHASE_COUNT,
		evaluationPhase,
		isEvaluationCompleted,
		workflowMoves,
		workflowRoles,
		workflowStatusLabel,
		type WorkflowMove
	} from '../utils/evaluationWorkflow';
	import { ratingDueTone } from '../utils/ratingDueTone';
	import EvaluatorField from './EvaluatorField.svelte';
	import * as Alert from '$lib/components/ui/alert';
	import { ConfirmDialog } from '$lib/components/ui/confirm-dialog';
	import * as AppDialog from '$lib/components/ui/app-dialog';
	import { Button } from '$lib/components/ui/button';
	import * as Combobox from '$lib/components/ui/combobox';
	import { DatePicker } from '$lib/components/ui/date-picker';
	import * as Field from '$lib/components/ui/field';
	import * as Select from '$lib/components/ui/select';
	import * as ToggleGroup from '$lib/components/ui/toggle-group';
	import { Textarea } from '$lib/components/ui/textarea';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { formatDayMonthYear, formatToday } from '$lib/utils/dates';
	import { cn } from '$lib/utils';

	interface Props {
		entry: RatingSchemeEntry | null;
		personnel: PersonnelLookup[];
		isCurrentWorkspace: () => boolean;
		onSave: (data: RatingSchemeEntrySaveData, isCurrent: () => boolean) => Promise<void>;
		onDelete?: (id: string, isCurrent: () => boolean) => Promise<boolean>;
		/** Resolves to the saved step, or undefined when the workspace changed first. */
		onMove?: (
			id: string,
			to: WorkflowStatus | null,
			isCurrent: () => boolean
		) => Promise<WorkflowStatus | null | undefined>;
		/** Resolves true when a successor was opened, false when the evaluation was already completed. */
		onChangeRater?: (id: string, change: RatingSchemeRaterChange, isCurrent: () => boolean) => Promise<boolean>;
		onClose: () => void;
	}

	let { entry, personnel, isCurrentWorkspace, onSave, onDelete, onMove, onChangeRater, onClose }: Props = $props();
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

	function initialWorkflowStatus() {
		return entry?.workflowStatus ?? null;
	}

	let draft = $state(createInitialDraft());
	const pristineDraft = JSON.stringify(createInitialDraft());
	let showDeleteConfirm = $state(false);
	let saveAttempted = $state(false);
	let isSaving = $state(false);
	let isDeleting = $state(false);
	let saveError = $state('');
	let saveButton = $state<HTMLButtonElement | null>(null);
	let workflowStatus = $state(initialWorkflowStatus());
	let isMoving = $state(false);
	let moveError = $state('');
	let showChangeRater = $state(false);
	let newRater = $state<EvaluatorDraft>({ kind: 'empty' });
	let changeDate = $state('');
	let changeRaterError = $state('');
	let isChangingRater = $state(false);
	const busy = $derived(isSaving || isDeleting || isMoving || isChangingRater);
	const dirty = $derived(JSON.stringify(draft) !== pristineDraft);

	const view = $derived(getRatingSchemeEntryDraftView(draft));
	const missingRequired = $derived(saveAttempted ? view.missingRequired : []);

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

	function getSaveErrorMessage(error: unknown, fallback: string): string {
		if (error instanceof Error && error.message.trim()) return error.message;
		return fallback;
	}

	const fieldIds: Record<RatingSchemeRequiredField, string> = {
		ratedPerson: 'rated-individual',
		ratingPeriodStart: 'period-start',
		ratingPeriodEnd: 'period-end',
		rater: 'rater',
		seniorRater: 'senior-rater'
	};

	async function handleSave() {
		saveAttempted = true;
		if (busy || !isCurrent()) return;
		if (!view.canSave) {
			const first = view.missingRequired[0];
			await tick();
			if (isCurrent() && first) document.getElementById(fieldIds[first])?.focus();
			return;
		}

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

	const phase = $derived(evaluationPhase(workflowStatus));
	const moves = $derived(entry && onMove ? workflowMoves(workflowStatus, workflowRoles(entry)) : []);
	const canChangeRater = $derived(!!entry && !!onChangeRater && !isEvaluationCompleted(workflowStatus));

	function moveLabel(move: WorkflowMove): string {
		switch (move.kind) {
			case 'start':
				return 'Start tracking';
			case 'complete':
				return 'Mark completed';
			case 'stop':
				return 'Stop tracking';
			case 'reopen':
				return 'Reopen';
			case 'back':
				return `Back to ${workflowStatusLabel(move.to)}`;
			case 'next':
				return `Move to ${workflowStatusLabel(move.to)}`;
		}
	}

	async function handleMove(to: WorkflowStatus | null) {
		const moveHandler = onMove;
		if (!entry || !moveHandler || busy || dirty || !isCurrent()) return;
		moveError = '';
		isMoving = true;
		try {
			const saved = await moveHandler(entry.id, to, isCurrent);
			if (isCurrent() && saved !== undefined) workflowStatus = saved;
		} catch (error) {
			if (isCurrent()) moveError = getSaveErrorMessage(error, 'The workflow did not move. Try again.');
		} finally {
			if (isCurrent()) isMoving = false;
		}
	}

	function openChangeRater() {
		if (!entry) return;
		const today = formatToday();
		const { ratingPeriodStart: start, ratingPeriodEnd: end } = entry;
		changeDate = today < start ? start : today > end ? end : today;
		newRater = { kind: 'empty' };
		changeRaterError = '';
		showChangeRater = true;
	}

	async function handleChangeRater() {
		const changeHandler = onChangeRater;
		if (!entry || !changeHandler || busy || !isCurrent()) return;
		if (newRater.kind === 'empty' || !changeDate) {
			changeRaterError = 'Choose the new rater and the last day with the current rater.';
			return;
		}
		const change: RatingSchemeRaterChange = {
			changeDate,
			raterPersonId: newRater.kind === 'person' ? newRater.personId : null,
			raterName: newRater.kind === 'external' ? newRater.name : null
		};
		changeRaterError = '';
		isChangingRater = true;
		try {
			const opened = await changeHandler(entry.id, change, isCurrent);
			if (!isCurrent()) return;
			if (opened) toastStore.success('Rater changed. A new evaluation was opened.');
			else toastStore.info('This evaluation was already completed.');
			showChangeRater = false;
			onClose();
		} catch (error) {
			if (isCurrent()) changeRaterError = getSaveErrorMessage(error, 'The rater was not changed. Try again.');
		} finally {
			if (isCurrent()) isChangingRater = false;
		}
	}

	function formatPersonLabel(p: PersonnelLookup): string {
		return `${p.rank} ${p.lastName}, ${p.firstName}`;
	}

	function evaluatorName(personId: string | null, name: string | null): string {
		if (personId) {
			const person = personnel.find((p) => p.id === personId);
			return person ? `${person.rank} ${person.lastName}` : 'Unknown';
		}
		return name ?? 'not set';
	}

	const ratedPerson = $derived(entry ? personnel.find((p) => p.id === entry.ratedPersonId) : undefined);
	const headerDue = $derived(entry ? getRatingDueLabel(entry.ratingPeriodEnd, workflowStatus) : null);
	const headerDueLine = $derived.by(() => {
		if (!entry || !headerDue) return '';
		const days = Math.abs(getDaysUntilDue(entry.ratingPeriodEnd));
		const plural = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`;
		switch (headerDue.status) {
			case 'overdue':
				return `Thru ${formatDayMonthYear(entry.ratingPeriodEnd).padStart(11, '0')} · ${plural(days)} past`;
			case 'due-30':
			case 'due-60':
				return `Thru in ${plural(days)}`;
			default:
				return headerDue.text;
		}
	});
	const evalTypeOptions: RatingSchemeEntryEvalType[] = ['OER', 'NCOER', 'WOER'];
</script>

{#snippet requiredError(missingLabel: RatingSchemeRequiredField, message: string)}
	{#if missingRequired.includes(missingLabel)}<Field.Error>{message}</Field.Error>{/if}
{/snippet}

{#snippet sectionTitle(title: string)}
	<h3 class="font-mono text-[0.6875rem] leading-3.5 font-medium tracking-[0.08em] text-muted-foreground uppercase">
		{title}
	</h3>
{/snippet}

{#snippet chainRow(
	label: string,
	id: string,
	evaluator: EvaluatorDraft,
	onChange: (next: EvaluatorDraft) => void,
	error?: { field: RatingSchemeRequiredField; message: string },
	onRemove?: () => void
)}
	<Field.Root class="gap-1.5 sm:grid sm:grid-cols-[110px_minmax(0,1fr)] sm:items-start sm:gap-x-3">
		<Field.Label for={id} class="text-sm font-medium sm:h-9 sm:items-center">{label}</Field.Label>
		<div class="grid gap-1.5">
			<div class="flex items-center gap-1.5">
				<div class="min-w-0 flex-1">
					<EvaluatorField {id} {label} value={evaluator} people={personnelOptions} {onChange} class="h-9" />
				</div>
				{#if onRemove}
					<Button variant="ghost" size="icon-sm" aria-label="Remove {label.toLowerCase()}" onclick={onRemove}>
						<XIcon aria-hidden="true" />
					</Button>
				{/if}
			</div>
			{#if error}{@render requiredError(error.field, error.message)}{/if}
		</div>
	</Field.Root>
{/snippet}

<AppDialog.Root open {busy} closeBlocked={dirty} {onClose}>
	<AppDialog.Content presentation="sheet" size="wide">
		<AppDialog.Header
			class="gap-2 border-b px-7 pt-7 pb-5"
			eyebrow={entry
				? `Edit entry · SR ${evaluatorName(entry.seniorRaterPersonId, entry.seniorRaterName)}`
				: 'New entry'}
		>
			<AppDialog.Title class="font-heading text-[34px] leading-[34px] font-extrabold uppercase">
				{#if entry}
					{ratedPerson ? formatPersonLabel(ratedPerson) : 'Unknown'}
				{:else}
					Add entry
				{/if}
			</AppDialog.Title>
			<AppDialog.Description
				class={cn(
					'flex items-center gap-2 text-sm',
					headerDue && cn('font-semibold', ratingDueTone[headerDue.status].text)
				)}
			>
				{#if entry && headerDue}
					<span class={cn('size-2 shrink-0 rounded-full', ratingDueTone[headerDue.status].rail)} aria-hidden="true"
					></span>
					{headerDueLine}
				{:else}
					Pick the Soldier first. Eval type comes from their rank.
				{/if}
			</AppDialog.Description>
		</AppDialog.Header>

		<AppDialog.Body class="p-0">
			<fieldset class="contents" disabled={busy}>
				{#if !entry}
					<section class="grid gap-3 border-b px-7 py-5.5">
						{@render sectionTitle('Rated Soldier')}
						<Field.Root>
							<Field.Label for="rated-individual" class="sr-only">Rated Soldier</Field.Label>
							<Combobox.Root
								items={personnelOptions}
								bind:value={draft.ratedPersonId}
								label="Rated Soldier"
								autoHighlight
								onValueChange={handleRatedPersonValueChange}
							>
								<Combobox.Trigger id="rated-individual" class="h-9" clearable placeholder="Search personnel..." />
								<Combobox.Content>
									<Combobox.Search placeholder="Search personnel..." />
									<Combobox.Empty>No personnel found.</Combobox.Empty>
									<Combobox.List />
								</Combobox.Content>
							</Combobox.Root>
							{@render requiredError('ratedPerson', 'Rated Soldier is required.')}
						</Field.Root>
					</section>
				{/if}

				<section class="grid gap-3 border-b px-7 py-5.5">
					{@render sectionTitle('Evaluation')}
					<Field.Root>
						<Field.Title id="eval-type-label">Type</Field.Title>
						<ToggleGroup.Root
							type="single"
							class="w-full"
							aria-labelledby="eval-type-label"
							bind:value={
								() => draft.evalType,
								(value) => {
									if (value) handleEvalTypeValueChange(value);
								}
							}
						>
							{#each evalTypeOptions as option (option)}
								<ToggleGroup.Item value={option} class="flex-1">{option}</ToggleGroup.Item>
							{/each}
						</ToggleGroup.Root>
					</Field.Root>
					<Field.Root>
						<Field.Label for="report-type">Report</Field.Label>
						<Select.Root
							type="single"
							value={draft.reportType}
							onValueChange={(value) => handleReportTypeValueChange(value as string)}
						>
							<Select.Trigger id="report-type" class="h-9 w-full">
								{draft.reportType ? `${draft.reportType} · ${view.reportTypeLabel}` : view.reportTypeLabel}
							</Select.Trigger>
							<Select.Content>
								{#each view.reportTypeOptions as opt (opt.value)}
									<Select.Item value={opt.value} label={`${opt.value} · ${opt.label}`} />
								{/each}
							</Select.Content>
						</Select.Root>
					</Field.Root>
				</section>

				<section class="grid gap-3 border-b px-7 py-5.5">
					{@render sectionTitle('Rating period')}
					<div class="grid grid-cols-2 gap-3">
						<Field.Root>
							<Field.Label for="period-start">Start</Field.Label>
							<DatePicker
								id="period-start"
								class="h-9"
								value={draft.ratingPeriodStart}
								placeholder="Select start date"
								onValueChange={handleRatingPeriodStartChange}
							/>
							{@render requiredError('ratingPeriodStart', 'Start date is required.')}
						</Field.Root>
						<Field.Root>
							<Field.Label for="period-end">Thru</Field.Label>
							<DatePicker
								id="period-end"
								class="h-9"
								value={draft.ratingPeriodEnd}
								placeholder="Select thru date"
								onValueChange={handleRatingPeriodEndChange}
							/>
							{@render requiredError('ratingPeriodEnd', 'Thru date is required.')}
						</Field.Root>
					</div>
					{#if draft.reportType === 'AN'}
						<p class="text-sm text-muted-foreground">Annual reports fill Thru in as 12 months after Start.</p>
					{/if}
					{#if view.eaWarning}
						<Alert.Root variant="warning">
							<Alert.Description>{view.eaWarning}</Alert.Description>
						</Alert.Root>
					{/if}
				</section>

				<section class="grid gap-3 border-b px-7 py-5.5">
					{@render sectionTitle('Rating chain')}
					{@render chainRow('Rater', 'rater', draft.rater, (next) => (draft.rater = next), {
						field: 'rater',
						message: 'Rater is required.'
					})}
					{#if draft.showIntermediate}
						{@render chainRow(
							'Intermediate rater',
							'intermediate-rater',
							draft.intermediateRater,
							(next) => (draft.intermediateRater = next),
							undefined,
							() => removeIntermediateRaterFromDraft(draft)
						)}
					{/if}
					{@render chainRow('Senior rater', 'senior-rater', draft.seniorRater, (next) => (draft.seniorRater = next), {
						field: 'seniorRater',
						message: 'Senior rater is required.'
					})}
					{#if draft.showReviewer}
						{@render chainRow(
							'Reviewer',
							'reviewer',
							draft.reviewer,
							(next) => (draft.reviewer = next),
							undefined,
							() => removeReviewerFromDraft(draft)
						)}
					{/if}
					<p class="text-[13px] text-muted-foreground sm:pl-[122px]">
						Search the unit, or type a name that isn't in it to add an external rater.
					</p>
					{#if !draft.showIntermediate || !draft.showReviewer}
						<div class="flex flex-wrap gap-x-4 gap-y-1 sm:pl-[122px]">
							{#if !draft.showIntermediate}
								<Button
									variant="link"
									size="none"
									class="text-sm underline"
									onclick={() => (draft.showIntermediate = true)}
								>
									+ Intermediate rater
								</Button>
							{/if}
							{#if !draft.showReviewer}
								<Button
									variant="link"
									size="none"
									class="text-sm underline"
									onclick={() => (draft.showReviewer = true)}
								>
									+ Reviewer
								</Button>
							{/if}
						</div>
					{/if}
				</section>

				{#if entry && (moves.length || canChangeRater)}
					<section class="grid gap-3 border-b px-7 py-5.5" aria-labelledby="workflow-step">
						{@render sectionTitle('Workflow')}
						<p id="workflow-step" class="text-sm">
							<span class="font-semibold">{phase.label}</span>
							{#if phase.step}<span class="text-muted-foreground">
									· step {phase.step} of {EVALUATION_PHASE_COUNT}</span
								>{/if}
						</p>
						<div class="flex flex-wrap gap-2">
							{#each moves as move (move.kind)}
								<Button
									variant={move.kind === 'next' || move.kind === 'start' ? 'default' : 'outline'}
									size="sm"
									disabled={busy || dirty}
									onclick={() => handleMove(move.to)}
								>
									{moveLabel(move)}
								</Button>
							{/each}
							{#if canChangeRater}
								<Button variant="outline" size="sm" disabled={busy || dirty} onclick={openChangeRater}>
									Change rater
								</Button>
							{/if}
						</div>
						{#if dirty}
							<p class="text-[13px] text-muted-foreground">Save or cancel your edits before moving the workflow.</p>
						{/if}
						{#if moveError}
							<Alert.Root variant="destructive" role="alert">
								<Alert.Title>The workflow did not move</Alert.Title>
								<Alert.Description>{moveError}</Alert.Description>
							</Alert.Root>
						{/if}
					</section>
				{/if}

				<section class="grid gap-3 px-7 py-5.5">
					<Field.Root>
						<div class="flex justify-between">
							<Field.Label for="entry-notes">Notes</Field.Label>
							<span class="text-[13px] text-muted-foreground">Optional</span>
						</div>
						<Textarea
							id="entry-notes"
							rows={3}
							bind:value={draft.notes}
							placeholder="Anything the next reader should know"
						/>
					</Field.Root>
				</section>
			</fieldset>
		</AppDialog.Body>

		{#if saveError}
			<Alert.Root variant="destructive" class="mx-7 mb-3 w-auto" role="alert">
				<Alert.Title>Rating entry was not saved</Alert.Title>
				<Alert.Description>{saveError}</Alert.Description>
			</Alert.Root>
		{/if}

		<AppDialog.Footer class="items-center border-t px-7 py-4 sm:justify-between">
			{#if entry && onDelete}
				<Button
					variant="link"
					size="none"
					class="text-destructive-text underline"
					disabled={busy}
					onclick={() => (showDeleteConfirm = true)}
				>
					Delete entry
				</Button>
			{:else}
				<span></span>
			{/if}
			<div class="flex gap-2">
				<Button variant="outline" onclick={onClose} disabled={busy}>Cancel</Button>
				<Button disabled={busy} onclick={handleSave} bind:ref={saveButton}>
					{isSaving ? 'Saving...' : entry ? 'Save changes' : 'Add entry'}
				</Button>
			</div>
		</AppDialog.Footer>
	</AppDialog.Content>
</AppDialog.Root>

{#if showChangeRater && entry}
	<ConfirmDialog
		title="Change rater"
		message="This evaluation closes as a Change of Rater report through the last day below. A new Annual evaluation opens for the new rater the next day."
		confirmLabel="Change rater"
		variant="default"
		loading={isChangingRater}
		onConfirm={handleChangeRater}
		onCancel={() => (showChangeRater = false)}
	>
		<div class="grid gap-3">
			<Field.Root>
				<Field.Label for="new-rater">New rater</Field.Label>
				<EvaluatorField
					id="new-rater"
					label="New rater"
					value={newRater}
					people={personnelOptions}
					onChange={(next) => {
						newRater = next;
						changeRaterError = '';
					}}
					class="h-9"
				/>
			</Field.Root>
			<Field.Root>
				<Field.Label for="rater-change-date">Last day with current rater</Field.Label>
				<DatePicker
					id="rater-change-date"
					class="h-9"
					value={changeDate}
					placeholder="Select date"
					onValueChange={(value) => {
						changeDate = value;
						changeRaterError = '';
					}}
				/>
			</Field.Root>
			{#if changeRaterError}
				<Alert.Root variant="destructive" role="alert">
					<Alert.Title>The rater was not changed</Alert.Title>
					<Alert.Description>{changeRaterError}</Alert.Description>
				</Alert.Root>
			{/if}
		</div>
	</ConfirmDialog>
{/if}

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
