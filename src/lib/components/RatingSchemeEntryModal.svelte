<script lang="ts">
	import type { Personnel, RatingSchemeEntry } from '$lib/types';
	import { getEvalTypeForRank } from '$lib/utils/ratingScheme';
	import Modal from './Modal.svelte';
	import Spinner from './ui/Spinner.svelte';

	interface Props {
		entry: RatingSchemeEntry | null;
		personnel: Personnel[];
		onSave: (data: Omit<RatingSchemeEntry, 'id'>) => Promise<void>;
		onDelete?: (id: string) => Promise<void>;
		onClose: () => void;
	}

	let { entry, personnel, onSave, onDelete, onClose }: Props = $props();

	const sortedPersonnel = $derived(
		[...personnel].sort((a, b) =>
			a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName)
		)
	);

	// Form state
	let ratedPersonId = $state(entry?.ratedPersonId ?? '');
	let evalType = $state<'OER' | 'NCOER' | 'WOER'>(entry?.evalType ?? 'NCOER');
	let raterMode = $state<'internal' | 'external'>(entry?.raterPersonId ? 'internal' : entry?.raterName ? 'external' : 'internal');
	let raterPersonId = $state(entry?.raterPersonId ?? '');
	let raterName = $state(entry?.raterName ?? '');
	let srMode = $state<'internal' | 'external'>(entry?.seniorRaterPersonId ? 'internal' : entry?.seniorRaterName ? 'external' : 'internal');
	let seniorRaterPersonId = $state(entry?.seniorRaterPersonId ?? '');
	let seniorRaterName = $state(entry?.seniorRaterName ?? '');
	let showIntermediate = $state(!!(entry?.intermediateRaterPersonId || entry?.intermediateRaterName));
	let irMode = $state<'internal' | 'external'>(entry?.intermediateRaterPersonId ? 'internal' : 'internal');
	let intermediateRaterPersonId = $state(entry?.intermediateRaterPersonId ?? '');
	let intermediateRaterName = $state(entry?.intermediateRaterName ?? '');
	let showReviewer = $state(!!(entry?.reviewerPersonId || entry?.reviewerName));
	let rvMode = $state<'internal' | 'external'>(entry?.reviewerPersonId ? 'internal' : 'internal');
	let reviewerPersonId = $state(entry?.reviewerPersonId ?? '');
	let reviewerName = $state(entry?.reviewerName ?? '');
	let ratingPeriodStart = $state(entry?.ratingPeriodStart ?? '');
	let ratingPeriodEnd = $state(entry?.ratingPeriodEnd ?? '');
	let status = $state(entry?.status ?? 'active');
	let notes = $state(entry?.notes ?? '');
	let saving = $state(false);
	let showDeleteConfirm = $state(false);

	// Auto-suggest eval type when rated person changes
	$effect(() => {
		if (!entry && ratedPersonId) {
			const person = personnel.find((p) => p.id === ratedPersonId);
			if (person) {
				evalType = getEvalTypeForRank(person.rank);
			}
		}
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
				notes: notes.trim() || null
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
		<label class="label" for="rated-person">Rated Individual</label>
		<select id="rated-person" class="select" bind:value={ratedPersonId} disabled={!!entry}>
			<option value="">Select a person...</option>
			{#each sortedPersonnel as p (p.id)}
				<option value={p.id}>{formatPersonLabel(p)}</option>
			{/each}
		</select>
	</div>

	<div class="form-group">
		<label class="label" for="eval-type">Evaluation Type</label>
		<select id="eval-type" class="select" bind:value={evalType}>
			<option value="OER">OER (Officer)</option>
			<option value="NCOER">NCOER (NCO)</option>
			<option value="WOER">WOER (Warrant Officer)</option>
		</select>
	</div>

	<fieldset class="rater-section">
		<legend class="section-legend">Rater <span class="required">*</span></legend>
		<div class="mode-toggle">
			<button class="toggle-btn" class:active={raterMode === 'internal'} onclick={() => (raterMode = 'internal')}>From Org</button>
			<button class="toggle-btn" class:active={raterMode === 'external'} onclick={() => (raterMode = 'external')}>External</button>
		</div>
		{#if raterMode === 'internal'}
			<select class="select" bind:value={raterPersonId}>
				<option value="">Select rater...</option>
				{#each sortedPersonnel as p (p.id)}
					<option value={p.id}>{formatPersonLabel(p)}</option>
				{/each}
			</select>
		{:else}
			<input class="input" type="text" bind:value={raterName} placeholder="Rank, Name, Position (e.g., MAJ Smith, S3)" />
		{/if}
	</fieldset>

	<fieldset class="rater-section">
		<legend class="section-legend">Senior Rater <span class="required">*</span></legend>
		<div class="mode-toggle">
			<button class="toggle-btn" class:active={srMode === 'internal'} onclick={() => (srMode = 'internal')}>From Org</button>
			<button class="toggle-btn" class:active={srMode === 'external'} onclick={() => (srMode = 'external')}>External</button>
		</div>
		{#if srMode === 'internal'}
			<select class="select" bind:value={seniorRaterPersonId}>
				<option value="">Select senior rater...</option>
				{#each sortedPersonnel as p (p.id)}
					<option value={p.id}>{formatPersonLabel(p)}</option>
				{/each}
			</select>
		{:else}
			<input class="input" type="text" bind:value={seniorRaterName} placeholder="Rank, Name, Position (e.g., COL Jones, BDE CDR)" />
		{/if}
	</fieldset>

	{#if !showIntermediate}
		<button class="btn-link" onclick={() => (showIntermediate = true)}>+ Add Intermediate Rater</button>
	{:else}
		<fieldset class="rater-section">
			<legend class="section-legend">
				Intermediate Rater
				<button class="btn-remove-section" onclick={() => { showIntermediate = false; intermediateRaterPersonId = ''; intermediateRaterName = ''; }}>Remove</button>
			</legend>
			<div class="mode-toggle">
				<button class="toggle-btn" class:active={irMode === 'internal'} onclick={() => (irMode = 'internal')}>From Org</button>
				<button class="toggle-btn" class:active={irMode === 'external'} onclick={() => (irMode = 'external')}>External</button>
			</div>
			{#if irMode === 'internal'}
				<select class="select" bind:value={intermediateRaterPersonId}>
					<option value="">Select intermediate rater...</option>
					{#each sortedPersonnel as p (p.id)}
						<option value={p.id}>{formatPersonLabel(p)}</option>
					{/each}
				</select>
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
				<button class="btn-remove-section" onclick={() => { showReviewer = false; reviewerPersonId = ''; reviewerName = ''; }}>Remove</button>
			</legend>
			<div class="mode-toggle">
				<button class="toggle-btn" class:active={rvMode === 'internal'} onclick={() => (rvMode = 'internal')}>From Org</button>
				<button class="toggle-btn" class:active={rvMode === 'external'} onclick={() => (rvMode = 'external')}>External</button>
			</div>
			{#if rvMode === 'internal'}
				<select class="select" bind:value={reviewerPersonId}>
					<option value="">Select reviewer...</option>
					{#each sortedPersonnel as p (p.id)}
						<option value={p.id}>{formatPersonLabel(p)}</option>
					{/each}
				</select>
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

	<div class="form-group">
		<label class="label" for="entry-status">Status</label>
		<select id="entry-status" class="select" bind:value={status}>
			<option value="active">Active</option>
			<option value="completed">Completed</option>
			<option value="change-of-rater">Change of Rater</option>
		</select>
	</div>

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
</style>
