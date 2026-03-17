<script lang="ts">
	import type { Personnel } from '$lib/types';
	import type { RatingSchemeEntry, ReportType, WorkflowStatus } from '../counseling.types';
	import { WORKFLOW_STATUS_OPTIONS, WORKFLOW_STATUS_COLORS } from '../counseling.types';
	import {
		getEvalTypeForRank,
		getReportTypesForEvalType,
		calculateThruDate,
		getExtendedAnnualWarning
	} from '$features/counseling/utils/ratingScheme';
	import Modal from '$lib/components/Modal.svelte';
	import Spinner from '$lib/components/ui/Spinner.svelte';
	import SearchSelect from '$lib/components/ui/SearchSelect.svelte';

	interface Props {
		entry: RatingSchemeEntry | null;
		personnel: Personnel[];
		onSave: (data: Omit<RatingSchemeEntry, 'id'>) => Promise<void>;
		onDelete?: (id: string) => Promise<void>;
		onClose: () => void;
	}

	let { entry, personnel, onSave, onDelete, onClose }: Props = $props();

	const sortedPersonnel = $derived(
		[...personnel].sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName))
	);

	const personnelOptions = $derived(sortedPersonnel.map((p) => ({ value: p.id, label: formatPersonLabel(p) })));

	// Form state
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
	let saving = $state(false);
	let showDeleteConfirm = $state(false);

	// Reset form state when entry changes (e.g. modal reopened with different data)
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
		saving = false;
		showDeleteConfirm = false;
	});

	const reportTypeOptions = $derived(getReportTypesForEvalType(evalType));

	// Reset report type if eval type changes and current selection is invalid
	$effect(() => {
		if (reportType) {
			const valid = reportTypeOptions.some((o) => o.value === reportType);
			if (!valid) reportType = '';
		}
	});

	// Auto-suggest eval type when rated person changes
	$effect(() => {
		if (!entry && ratedPersonId) {
			const person = personnel.find((p) => p.id === ratedPersonId);
			if (person) {
				evalType = getEvalTypeForRank(person.rank);
			}
		}
	});

	// Auto-fill thru date for Annual reports (new entries only)
	let autoFilledEnd = $state(false);
	$effect(() => {
		if (!entry && reportType === 'AN' && ratingPeriodStart && (!ratingPeriodEnd || autoFilledEnd)) {
			const calculated = calculateThruDate('AN', ratingPeriodStart);
			if (calculated) {
				ratingPeriodEnd = calculated;
				autoFilledEnd = true;
			}
		}
		if (reportType !== 'AN') {
			autoFilledEnd = false;
		}
	});

	// Extended Annual warning
	const eaWarning = $derived(
		getExtendedAnnualWarning(reportType || null, evalType, ratingPeriodStart, ratingPeriodEnd)
	);

	// Filter workflow steps: hide IR/reviewer if those roles aren't populated
	const filteredWorkflowOptions = $derived.by(() => {
		const hasIR = showIntermediate && (intermediateRaterPersonId || intermediateRaterName.trim());
		const hasReviewer = showReviewer && (reviewerPersonId || reviewerName.trim());
		return WORKFLOW_STATUS_OPTIONS.filter((opt) => {
			if (opt.value === 'with-intermediate-rater' || opt.value === 'ir-signed') return !!hasIR;
			if (opt.value === 'with-reviewer' || opt.value === 'reviewer-signed') return !!hasReviewer;
			return true;
		});
	});

	const canSave = $derived(
		!!ratedPersonId &&
			!!ratingPeriodStart &&
			!!ratingPeriodEnd &&
			(raterMode === 'internal' ? !!raterPersonId : !!raterName.trim()) &&
			(srMode === 'internal' ? !!seniorRaterPersonId : !!seniorRaterName.trim())
	);

	async function handleSave() {
		if (!canSave || saving) return;
		saving = true;
		try {
			await onSave({
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
			});
			onClose();
		} finally {
			saving = false;
		}
	}

	async function handleDelete() {
		if (!entry || !onDelete || saving) return;
		saving = true;
		try {
			await onDelete(entry.id);
			onClose();
		} finally {
			saving = false;
		}
	}

	function formatPersonLabel(p: Personnel): string {
		return `${p.rank} ${p.lastName}, ${p.firstName}`;
	}
</script>

<Modal title={entry ? 'Edit Rating Entry' : 'Add Rating Entry'} {onClose} width="550px" titleId="rating-entry-title">
	<div class="form-group">
		<label class="label">Rated Individual</label>
		<SearchSelect
			options={personnelOptions}
			bind:value={ratedPersonId}
			placeholder="Search personnel..."
			disabled={!!entry}
		/>
	</div>

	<div class="form-row">
		<div class="form-group">
			<label class="label" for="eval-type">Evaluation Type</label>
			<select id="eval-type" class="select" bind:value={evalType}>
				<option value="OER">OER (Officer)</option>
				<option value="NCOER">NCOER (NCO)</option>
				<option value="WOER">WOER (Warrant Officer)</option>
			</select>
		</div>
		<div class="form-group">
			<label class="label" for="report-type">Report Type</label>
			<select id="report-type" class="select" bind:value={reportType}>
				<option value="">Select report type...</option>
				{#each reportTypeOptions as opt (opt.value)}
					<option value={opt.value}>{opt.value} — {opt.label}</option>
				{/each}
			</select>
		</div>
	</div>

	<fieldset class="rater-section">
		<legend class="section-legend">Rater <span class="required">*</span></legend>
		<div class="mode-toggle">
			<button class="toggle-btn" class:active={raterMode === 'internal'} onclick={() => (raterMode = 'internal')}
				>From Org</button
			>
			<button class="toggle-btn" class:active={raterMode === 'external'} onclick={() => (raterMode = 'external')}
				>External</button
			>
		</div>
		{#if raterMode === 'internal'}
			<SearchSelect options={personnelOptions} bind:value={raterPersonId} placeholder="Search rater..." />
		{:else}
			<input
				class="input"
				type="text"
				bind:value={raterName}
				placeholder="Rank, Name, Position (e.g., MAJ Smith, S3)"
			/>
		{/if}
	</fieldset>

	<fieldset class="rater-section">
		<legend class="section-legend">Senior Rater <span class="required">*</span></legend>
		<div class="mode-toggle">
			<button class="toggle-btn" class:active={srMode === 'internal'} onclick={() => (srMode = 'internal')}
				>From Org</button
			>
			<button class="toggle-btn" class:active={srMode === 'external'} onclick={() => (srMode = 'external')}
				>External</button
			>
		</div>
		{#if srMode === 'internal'}
			<SearchSelect options={personnelOptions} bind:value={seniorRaterPersonId} placeholder="Search senior rater..." />
		{:else}
			<input
				class="input"
				type="text"
				bind:value={seniorRaterName}
				placeholder="Rank, Name, Position (e.g., COL Jones, BDE CDR)"
			/>
		{/if}
	</fieldset>

	{#if !showIntermediate}
		<button class="btn-link" onclick={() => (showIntermediate = true)}>+ Add Intermediate Rater</button>
	{:else}
		<fieldset class="rater-section">
			<legend class="section-legend">
				Intermediate Rater
				<button
					class="btn-remove-section"
					onclick={() => {
						showIntermediate = false;
						intermediateRaterPersonId = '';
						intermediateRaterName = '';
					}}>Remove</button
				>
			</legend>
			<div class="mode-toggle">
				<button class="toggle-btn" class:active={irMode === 'internal'} onclick={() => (irMode = 'internal')}
					>From Org</button
				>
				<button class="toggle-btn" class:active={irMode === 'external'} onclick={() => (irMode = 'external')}
					>External</button
				>
			</div>
			{#if irMode === 'internal'}
				<SearchSelect
					options={personnelOptions}
					bind:value={intermediateRaterPersonId}
					placeholder="Search intermediate rater..."
				/>
			{:else}
				<input class="input" type="text" bind:value={intermediateRaterName} placeholder="Rank, Name, Position" />
			{/if}
		</fieldset>
	{/if}

	{#if !showReviewer}
		<button class="btn-link" onclick={() => (showReviewer = true)}>+ Add Reviewer</button>
	{:else}
		<fieldset class="rater-section">
			<legend class="section-legend">
				Reviewer
				<button
					class="btn-remove-section"
					onclick={() => {
						showReviewer = false;
						reviewerPersonId = '';
						reviewerName = '';
					}}>Remove</button
				>
			</legend>
			<div class="mode-toggle">
				<button class="toggle-btn" class:active={rvMode === 'internal'} onclick={() => (rvMode = 'internal')}
					>From Org</button
				>
				<button class="toggle-btn" class:active={rvMode === 'external'} onclick={() => (rvMode = 'external')}
					>External</button
				>
			</div>
			{#if rvMode === 'internal'}
				<SearchSelect options={personnelOptions} bind:value={reviewerPersonId} placeholder="Search reviewer..." />
			{:else}
				<input class="input" type="text" bind:value={reviewerName} placeholder="Rank, Name, Position" />
			{/if}
		</fieldset>
	{/if}

	<div class="form-row">
		<div class="form-group">
			<label class="label" for="period-start">Rating Period Start</label>
			<input id="period-start" type="date" class="input" bind:value={ratingPeriodStart} />
		</div>
		<div class="form-group">
			<label class="label" for="period-end">Thru Date (Due)</label>
			<input id="period-end" type="date" class="input" bind:value={ratingPeriodEnd} />
		</div>
	</div>

	{#if eaWarning}
		<div class="warning-banner">{eaWarning}</div>
	{/if}

	<div class="form-group">
		<label class="label" for="entry-status">Status</label>
		<select id="entry-status" class="select" bind:value={status}>
			<option value="active">Active</option>
			<option value="completed">Completed</option>
			<option value="change-of-rater">Change of Rater</option>
		</select>
	</div>

	{#if !showWorkflow}
		<button class="btn-link" onclick={() => (showWorkflow = true)}>+ Track Workflow</button>
	{:else}
		<div class="form-group workflow-group">
			<div class="workflow-header">
				<label class="label" for="workflow-status">Workflow Status</label>
				<button
					class="btn-remove-section"
					onclick={() => {
						showWorkflow = false;
						workflowStatus = '';
					}}>Remove</button
				>
			</div>
			<select id="workflow-status" class="select" bind:value={workflowStatus}>
				<option value="">Select workflow step...</option>
				{#each filteredWorkflowOptions as opt (opt.value)}
					<option value={opt.value}>{opt.label}</option>
				{/each}
			</select>
		</div>
	{/if}

	<div class="form-group">
		<label class="label" for="entry-notes">Notes</label>
		<textarea id="entry-notes" class="input" rows="2" bind:value={notes} placeholder="Optional notes..."></textarea>
	</div>

	{#snippet footer()}
		{#if entry && onDelete}
			{#if showDeleteConfirm}
				<span class="delete-confirm-text">Delete this entry?</span>
				<button class="btn btn-danger btn-sm" onclick={handleDelete} disabled={saving}>Yes, Delete</button>
				<button class="btn btn-secondary btn-sm" onclick={() => (showDeleteConfirm = false)}>No</button>
			{:else}
				<button class="btn btn-danger" onclick={() => (showDeleteConfirm = true)}>Delete</button>
			{/if}
		{/if}
		<div class="spacer"></div>
		<button class="btn btn-secondary" onclick={onClose}>Cancel</button>
		<button class="btn btn-primary" disabled={!canSave || saving} onclick={handleSave}>
			{#if saving}<Spinner />{/if}
			{saving ? 'Saving...' : 'Save'}
		</button>
	{/snippet}
</Modal>

<style>
	.form-row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--spacing-md);
	}

	.rater-section {
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		padding: var(--spacing-md);
		margin-bottom: var(--spacing-md);
	}

	.section-legend {
		font-size: var(--font-size-sm);
		font-weight: 600;
		color: var(--color-text);
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
	}

	.required {
		color: var(--color-error);
	}

	.mode-toggle {
		display: flex;
		gap: 0;
		margin-bottom: var(--spacing-sm);
	}

	.toggle-btn {
		flex: 1;
		padding: var(--spacing-xs) var(--spacing-sm);
		font-size: var(--font-size-xs);
		border: 1px solid var(--color-border);
		background: transparent;
		color: var(--color-text-secondary);
		cursor: pointer;
		transition: all 0.15s;
	}

	.toggle-btn:first-child {
		border-radius: var(--radius-sm) 0 0 var(--radius-sm);
	}

	.toggle-btn:last-child {
		border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
		border-left: none;
	}

	.toggle-btn.active {
		background: var(--color-primary);
		border-color: var(--color-primary);
		color: white;
	}

	.btn-link {
		background: none;
		border: none;
		color: var(--color-primary);
		font-size: var(--font-size-sm);
		cursor: pointer;
		padding: var(--spacing-xs) 0;
		margin-bottom: var(--spacing-md);
	}

	.btn-link:hover {
		text-decoration: underline;
	}

	.btn-remove-section {
		background: none;
		border: none;
		color: var(--color-error);
		font-size: var(--font-size-xs);
		cursor: pointer;
		margin-left: auto;
	}

	.btn-remove-section:hover {
		text-decoration: underline;
	}

	.delete-confirm-text {
		font-size: var(--font-size-sm);
		color: var(--color-error);
	}

	.warning-banner {
		background: color-mix(in srgb, var(--color-warning) 15%, transparent);
		border: 1px solid var(--color-warning);
		border-radius: var(--radius-md);
		padding: var(--spacing-sm) var(--spacing-md);
		font-size: var(--font-size-sm);
		color: var(--color-warning);
		margin-bottom: var(--spacing-md);
	}

	.workflow-group {
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		padding: var(--spacing-md);
	}

	.workflow-header {
		display: flex;
		align-items: center;
		margin-bottom: var(--spacing-sm);
	}

	.workflow-header .label {
		margin-bottom: 0;
	}
</style>
