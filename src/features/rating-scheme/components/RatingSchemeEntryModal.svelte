<script lang="ts">
	import type { PersonnelLookup } from '$lib/types';
	import type { RatingSchemeEntry, ReportType, WorkflowStatus } from '../rating-scheme.types';
	import { WORKFLOW_STATUS_OPTIONS } from '../rating-scheme.types';
	import {
		getEvalTypeForRank,
		getReportTypesForEvalType,
		calculateThruDate,
		getExtendedAnnualWarning
	} from '$features/rating-scheme/utils/ratingScheme';
	import * as Alert from '$lib/components/ui/alert';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import * as AppDialog from '$lib/components/ui/app-dialog';
	import { Button } from '$lib/components/ui/button';
	import * as ButtonGroup from '$lib/components/ui/button-group';
	import { DatePicker } from '$lib/components/ui/date-picker';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import SearchCombobox from '$lib/components/ui/SearchCombobox.svelte';
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

	let ratedPersonId = $state('');
	let evalType = $state<'OER' | 'NCOER' | 'WOER'>('NCOER');
	let reportType = $state<ReportType | ''>('');
	let raterMode = $state<'internal' | 'external'>('internal');
	let raterPersonId = $state('');
	let raterName = $state('');
	let srMode = $state<'internal' | 'external'>('internal');
	let seniorRaterPersonId = $state('');
	let seniorRaterName = $state('');
	let showIntermediate = $state(false);
	let irMode = $state<'internal' | 'external'>('internal');
	let intermediateRaterPersonId = $state('');
	let intermediateRaterName = $state('');
	let showReviewer = $state(false);
	let rvMode = $state<'internal' | 'external'>('internal');
	let reviewerPersonId = $state('');
	let reviewerName = $state('');
	let ratingPeriodStart = $state('');
	let ratingPeriodEnd = $state('');
	let status = $state<'active' | 'completed' | 'change-of-rater'>('active');
	let workflowStatus = $state<WorkflowStatus | ''>('');
	let showWorkflow = $state(false);
	let notes = $state('');
	let showDeleteConfirm = $state(false);
	let saveAttempted = $state(false);
	let isSaving = $state(false);

	$effect(() => {
		ratedPersonId = entry?.ratedPersonId ?? '';
		evalType = entry?.evalType ?? 'NCOER';
		reportType = entry?.reportType ?? '';
		raterMode = entry?.raterPersonId ? 'internal' : entry?.raterName ? 'external' : 'internal';
		raterPersonId = entry?.raterPersonId ?? '';
		raterName = entry?.raterName ?? '';
		srMode = entry?.seniorRaterPersonId ? 'internal' : entry?.seniorRaterName ? 'external' : 'internal';
		seniorRaterPersonId = entry?.seniorRaterPersonId ?? '';
		seniorRaterName = entry?.seniorRaterName ?? '';
		showIntermediate = !!(entry?.intermediateRaterPersonId || entry?.intermediateRaterName);
		irMode = entry?.intermediateRaterPersonId ? 'internal' : 'internal';
		intermediateRaterPersonId = entry?.intermediateRaterPersonId ?? '';
		intermediateRaterName = entry?.intermediateRaterName ?? '';
		showReviewer = !!(entry?.reviewerPersonId || entry?.reviewerName);
		rvMode = entry?.reviewerPersonId ? 'internal' : 'internal';
		reviewerPersonId = entry?.reviewerPersonId ?? '';
		reviewerName = entry?.reviewerName ?? '';
		ratingPeriodStart = entry?.ratingPeriodStart ?? '';
		ratingPeriodEnd = entry?.ratingPeriodEnd ?? '';
		status = entry?.status ?? 'active';
		workflowStatus = entry?.workflowStatus ?? '';
		showWorkflow = !!entry?.workflowStatus;
		notes = entry?.notes ?? '';
		showDeleteConfirm = false;
		saveAttempted = false;
		isSaving = false;
	});

	const reportTypeOptions = $derived(getReportTypesForEvalType(evalType));
	const evalTypeLabel = $derived(
		evalType === 'OER' ? 'OER (Officer)' : evalType === 'WOER' ? 'WOER (Warrant Officer)' : 'NCOER (NCO)'
	);
	const reportTypeLabel = $derived(
		reportType
			? (reportTypeOptions.find((option) => option.value === reportType)?.label ?? reportType)
			: 'Select report type...'
	);
	const statusLabel = $derived(
		status === 'completed' ? 'Completed' : status === 'change-of-rater' ? 'Change of Rater' : 'Active'
	);

	$effect(() => {
		if (reportType && !reportTypeOptions.some((o) => o.value === reportType)) reportType = '';
	});

	$effect(() => {
		if (!entry && ratedPersonId) {
			const person = personnel.find((p) => p.id === ratedPersonId);
			if (person) evalType = getEvalTypeForRank(person.rank);
		}
	});

	let autoFilledEnd = $state(false);
	$effect(() => {
		if (!entry && reportType === 'AN' && ratingPeriodStart && (!ratingPeriodEnd || autoFilledEnd)) {
			const calculated = calculateThruDate('AN', ratingPeriodStart);
			if (calculated) {
				ratingPeriodEnd = calculated;
				autoFilledEnd = true;
			}
		}
		if (reportType !== 'AN') autoFilledEnd = false;
	});

	const eaWarning = $derived(
		getExtendedAnnualWarning(reportType || null, evalType, ratingPeriodStart, ratingPeriodEnd)
	);
	const filteredWorkflowOptions = $derived.by(() => {
		const hasIR = showIntermediate && (intermediateRaterPersonId || intermediateRaterName.trim());
		const hasReviewer = showReviewer && (reviewerPersonId || reviewerName.trim());
		return WORKFLOW_STATUS_OPTIONS.filter((opt) => {
			if (opt.value === 'with-intermediate-rater' || opt.value === 'ir-signed') return !!hasIR;
			if (opt.value === 'with-reviewer' || opt.value === 'reviewer-signed') return !!hasReviewer;
			return true;
		});
	});
	const workflowStatusLabel = $derived(
		workflowStatus
			? (filteredWorkflowOptions.find((option) => option.value === workflowStatus)?.label ?? workflowStatus)
			: 'Select workflow step...'
	);
	const missingRequiredLabels = $derived.by(() => {
		const missing: string[] = [];
		if (!ratedPersonId) missing.push('rated individual');
		if (raterMode === 'internal' ? !raterPersonId : !raterName.trim()) missing.push('rater');
		if (srMode === 'internal' ? !seniorRaterPersonId : !seniorRaterName.trim()) missing.push('senior rater');
		if (!ratingPeriodStart) missing.push('rating period start');
		if (!ratingPeriodEnd) missing.push('thru date');
		return missing;
	});
	const canSave = $derived(missingRequiredLabels.length === 0);

	function getSaveErrorMessage(error: unknown): string {
		if (error instanceof Error && error.message.trim()) return error.message;
		return entry ? 'Failed to update rating entry' : 'Failed to add rating entry';
	}

	async function handleSave() {
		saveAttempted = true;
		if (!canSave || isSaving) return;

		isSaving = true;
		const saveData = {
			ratedPersonId,
			evalType,
			raterPersonId: raterMode === 'internal' ? raterPersonId || null : null,
			raterName: raterMode === 'external' ? raterName.trim() || null : null,
			seniorRaterPersonId: srMode === 'internal' ? seniorRaterPersonId || null : null,
			seniorRaterName: srMode === 'external' ? seniorRaterName.trim() || null : null,
			intermediateRaterPersonId: showIntermediate && irMode === 'internal' ? intermediateRaterPersonId || null : null,
			intermediateRaterName: showIntermediate && irMode === 'external' ? intermediateRaterName.trim() || null : null,
			reviewerPersonId: showReviewer && rvMode === 'internal' ? reviewerPersonId || null : null,
			reviewerName: showReviewer && rvMode === 'external' ? reviewerName.trim() || null : null,
			ratingPeriodStart,
			ratingPeriodEnd,
			status,
			notes: notes.trim() || null,
			reportType: reportType || null,
			workflowStatus: showWorkflow && workflowStatus ? (workflowStatus as WorkflowStatus) : null
		};
		try {
			await onSave(saveData);
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
			{#if saveAttempted && missingRequiredLabels.length > 0}
				<Alert.Root variant="warning">
					<Alert.Title>Complete required fields</Alert.Title>
					<Alert.Description>Missing: {missingRequiredLabels.join(', ')}.</Alert.Description>
				</Alert.Root>
			{/if}

			<Field.Root>
				<Field.Label for="rated-individual">Rated Individual</Field.Label>
				<SearchCombobox
					id="rated-individual"
					options={personnelOptions}
					bind:value={ratedPersonId}
					disabled={!!entry}
					placeholder="Search personnel..."
					ariaLabel="Rated individual"
				/>
			</Field.Root>

			<div class="grid gap-4 sm:grid-cols-2">
				<Field.Root>
					<Field.Label for="eval-type">Evaluation Type</Field.Label>
					<Select.Root type="single" bind:value={evalType}>
						<Select.Trigger id="eval-type" class="w-full">{evalTypeLabel}</Select.Trigger>
						<Select.Content>
							<Select.Item value="OER" label="OER (Officer)" />
							<Select.Item value="NCOER" label="NCOER (NCO)" />
							<Select.Item value="WOER" label="WOER (Warrant Officer)" />
						</Select.Content>
					</Select.Root>
				</Field.Root>
				<Field.Root>
					<Field.Label for="report-type">Report Type</Field.Label>
					<Select.Root type="single" bind:value={reportType}>
						<Select.Trigger id="report-type" class="w-full">{reportTypeLabel}</Select.Trigger>
						<Select.Content>
							{#each reportTypeOptions as opt (opt.value)}
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
						variant={raterMode === 'internal' ? 'secondary' : 'outline'}
						aria-pressed={raterMode === 'internal'}
						onclick={() => (raterMode = 'internal')}>From Org</Button
					>
					<Button
						variant={raterMode === 'external' ? 'secondary' : 'outline'}
						aria-pressed={raterMode === 'external'}
						onclick={() => (raterMode = 'external')}>External</Button
					>
				</ButtonGroup.Root>
				{#if raterMode === 'internal'}
					<SearchCombobox
						options={personnelOptions}
						bind:value={raterPersonId}
						placeholder="Search rater..."
						ariaLabel="Rater from organization"
					/>
				{:else}
					<Input type="text" bind:value={raterName} placeholder="Rank, Name, Position (e.g., MAJ Smith, S3)" />
				{/if}
			</Field.Set>

			<Field.Set class="rounded-lg border bg-muted/20 p-4">
				<Field.Legend>Senior Rater *</Field.Legend>
				<ButtonGroup.Root aria-label="Senior rater source">
					<Button
						variant={srMode === 'internal' ? 'secondary' : 'outline'}
						aria-pressed={srMode === 'internal'}
						onclick={() => (srMode = 'internal')}>From Org</Button
					>
					<Button
						variant={srMode === 'external' ? 'secondary' : 'outline'}
						aria-pressed={srMode === 'external'}
						onclick={() => (srMode = 'external')}>External</Button
					>
				</ButtonGroup.Root>
				{#if srMode === 'internal'}
					<SearchCombobox
						options={personnelOptions}
						bind:value={seniorRaterPersonId}
						placeholder="Search senior rater..."
						ariaLabel="Senior rater from organization"
					/>
				{:else}
					<Input
						type="text"
						bind:value={seniorRaterName}
						placeholder="Rank, Name, Position (e.g., COL Jones, BDE CDR)"
					/>
				{/if}
			</Field.Set>

			{#if !showIntermediate}
				<Button variant="ghost" class="w-fit" onclick={() => (showIntermediate = true)}>Add Intermediate Rater</Button>
			{:else}
				<Field.Set class="rounded-lg border bg-muted/20 p-4">
					<div class="flex items-center justify-between gap-2">
						<Field.Legend>Intermediate Rater</Field.Legend>
						<Button
							variant="destructive"
							size="sm"
							onclick={() => {
								showIntermediate = false;
								intermediateRaterPersonId = '';
								intermediateRaterName = '';
							}}>Remove</Button
						>
					</div>
					<ButtonGroup.Root aria-label="Intermediate rater source">
						<Button
							variant={irMode === 'internal' ? 'secondary' : 'outline'}
							aria-pressed={irMode === 'internal'}
							onclick={() => (irMode = 'internal')}>From Org</Button
						>
						<Button
							variant={irMode === 'external' ? 'secondary' : 'outline'}
							aria-pressed={irMode === 'external'}
							onclick={() => (irMode = 'external')}>External</Button
						>
					</ButtonGroup.Root>
					{#if irMode === 'internal'}
						<SearchCombobox
							options={personnelOptions}
							bind:value={intermediateRaterPersonId}
							placeholder="Search intermediate rater..."
							ariaLabel="Intermediate rater from organization"
						/>
					{:else}
						<Input type="text" bind:value={intermediateRaterName} placeholder="Rank, Name, Position" />
					{/if}
				</Field.Set>
			{/if}

			{#if !showReviewer}
				<Button variant="ghost" class="w-fit" onclick={() => (showReviewer = true)}>Add Reviewer</Button>
			{:else}
				<Field.Set class="rounded-lg border bg-muted/20 p-4">
					<div class="flex items-center justify-between gap-2">
						<Field.Legend>Reviewer</Field.Legend>
						<Button
							variant="destructive"
							size="sm"
							onclick={() => {
								showReviewer = false;
								reviewerPersonId = '';
								reviewerName = '';
							}}>Remove</Button
						>
					</div>
					<ButtonGroup.Root aria-label="Reviewer source">
						<Button
							variant={rvMode === 'internal' ? 'secondary' : 'outline'}
							aria-pressed={rvMode === 'internal'}
							onclick={() => (rvMode = 'internal')}>From Org</Button
						>
						<Button
							variant={rvMode === 'external' ? 'secondary' : 'outline'}
							aria-pressed={rvMode === 'external'}
							onclick={() => (rvMode = 'external')}>External</Button
						>
					</ButtonGroup.Root>
					{#if rvMode === 'internal'}
						<SearchCombobox
							options={personnelOptions}
							bind:value={reviewerPersonId}
							placeholder="Search reviewer..."
							ariaLabel="Reviewer from organization"
						/>
					{:else}
						<Input type="text" bind:value={reviewerName} placeholder="Rank, Name, Position" />
					{/if}
				</Field.Set>
			{/if}

			<div class="grid gap-4 sm:grid-cols-2">
				<Field.Root>
					<Field.Label for="period-start">Rating Period Start</Field.Label>
					<DatePicker id="period-start" bind:value={ratingPeriodStart} placeholder="Select start date" />
				</Field.Root>
				<Field.Root>
					<Field.Label for="period-end">Thru Date (Due)</Field.Label>
					<DatePicker id="period-end" bind:value={ratingPeriodEnd} placeholder="Select thru date" />
				</Field.Root>
			</div>

			{#if eaWarning}
				<Alert.Root variant="warning">
					<Alert.Description>{eaWarning}</Alert.Description>
				</Alert.Root>
			{/if}

			<Field.Root>
				<Field.Label for="entry-status">Status</Field.Label>
				<Select.Root type="single" bind:value={status}>
					<Select.Trigger id="entry-status" class="w-full">{statusLabel}</Select.Trigger>
					<Select.Content>
						<Select.Item value="active" label="Active" />
						<Select.Item value="completed" label="Completed" />
						<Select.Item value="change-of-rater" label="Change of Rater" />
					</Select.Content>
				</Select.Root>
			</Field.Root>

			{#if !showWorkflow}
				<Button variant="ghost" class="w-fit" onclick={() => (showWorkflow = true)}>Track Workflow</Button>
			{:else}
				<Field.Set class="rounded-lg border bg-muted/20 p-4">
					<div class="flex items-center justify-between gap-2">
						<Field.Legend>Workflow Status</Field.Legend>
						<Button
							variant="destructive"
							size="sm"
							onclick={() => {
								showWorkflow = false;
								workflowStatus = '';
							}}>Remove</Button
						>
					</div>
					<Select.Root type="single" bind:value={workflowStatus}>
						<Select.Trigger id="workflow-status" class="w-full">{workflowStatusLabel}</Select.Trigger>
						<Select.Content>
							{#each filteredWorkflowOptions as opt (opt.value)}
								<Select.Item value={opt.value} label={opt.label} />
							{/each}
						</Select.Content>
					</Select.Root>
				</Field.Set>
			{/if}

			<Field.Root>
				<Field.Label for="entry-notes">Notes</Field.Label>
				<Textarea id="entry-notes" rows={2} bind:value={notes} placeholder="Optional notes..." />
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
