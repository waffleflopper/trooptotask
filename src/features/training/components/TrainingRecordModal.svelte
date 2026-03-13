<script lang="ts">
	import type { Personnel } from '$lib/types';
	import type { TrainingType, PersonnelTraining } from '$features/training/training.types';
	import { calculateExpirationDate, getTrainingStatus } from '$features/training/utils/trainingStatus';
	import { formatDate } from '$lib/utils/dates';
	import { toastStore } from '$lib/stores/toast.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';

	interface Props {
		person: Personnel;
		trainingType: TrainingType;
		existingTraining: PersonnelTraining | undefined;
		onSave: (data: Omit<PersonnelTraining, 'id'>) => void | Promise<void>;
		onRemove: (id: string) => void | Promise<void>;
		onClose: () => void;
		canBeExempted?: boolean;
		isExempt?: boolean;
		onToggleExempt?: (exempt: boolean) => void;
	}

	let { person, trainingType, existingTraining, onSave, onRemove, onClose, canBeExempted = false, isExempt = false, onToggleExempt }: Props = $props();

	const neverExpires = trainingType.expirationMonths === null && !trainingType.expirationDateOnly;
	const expirationDateOnly = trainingType.expirationDateOnly;
	const todayStr = formatDate(new Date());

	// Initialize state
	let isComplete = $state(false);
	let completionDate = $state(neverExpires ? '' : todayStr);
	// For expiration-date-only types, seed directly from the stored expiration date
	let directExpirationDate = $state('');
	let notes = $state('');
	let certificateUrl = $state('');

	$effect(() => {
		isComplete = !!existingTraining;
		completionDate = existingTraining?.completionDate ?? (neverExpires ? '' : todayStr);
		directExpirationDate = existingTraining?.expirationDate ?? '';
		notes = existingTraining?.notes ?? '';
		certificateUrl = existingTraining?.certificateUrl ?? '';
	});

	const previewExpirationDate = $derived(
		expirationDateOnly
			? directExpirationDate || null
			: completionDate ? calculateExpirationDate(completionDate, trainingType.expirationMonths) : null
	);

	const previewTraining = $derived({
		id: existingTraining?.id ?? '',
		personnelId: person.id,
		trainingTypeId: trainingType.id,
		completionDate: expirationDateOnly ? null : (completionDate || null),
		expirationDate: previewExpirationDate,
		notes,
		certificateUrl
	} as PersonnelTraining);

	const previewStatus = $derived.by(() => {
		if (neverExpires && isComplete) {
			return getTrainingStatus(previewTraining, trainingType, person);
		}
		if (expirationDateOnly) {
			return getTrainingStatus(directExpirationDate ? previewTraining : undefined, trainingType, person);
		}
		if (!completionDate) {
			return getTrainingStatus(undefined, trainingType, person);
		}
		return getTrainingStatus(previewTraining, trainingType, person);
	});

	const canSave = $derived(
		expirationDateOnly ? !!directExpirationDate : neverExpires ? isComplete : !!completionDate
	);

	let saving = $state(false);

	async function handleSave() {
		if (!canSave || saving) return;
		saving = true;
		try {
			await onSave({
				personnelId: person.id,
				trainingTypeId: trainingType.id,
				completionDate: expirationDateOnly ? null : (completionDate || null),
				expirationDate: previewExpirationDate,
				notes: notes.trim() || null,
				certificateUrl: certificateUrl.trim() || null
			});
			toastStore.success(existingTraining ? 'Training record updated' : 'Training record saved');
			onClose();
		} finally {
			saving = false;
		}
	}

	let showRemoveConfirm = $state(false);

	function handleRemove() {
		showRemoveConfirm = true;
	}

	async function doRemove() {
		if (existingTraining) {
			try {
				await onRemove(existingTraining.id);
			} catch (err) {
				console.error('Training record removal failed:', err);
			}
			onClose();
		}
	}
</script>

<Modal
	title="{existingTraining ? 'Edit' : 'Add'} Training Record"
	{onClose}
	width="450px"
	titleId="training-record-title"
>
	<div class="person-info">
		<span class="person-rank">{person.rank}</span>
		<span class="person-name">{person.lastName}, {person.firstName}</span>
	</div>

	<div class="training-info">
		<Badge label={trainingType.name} color={trainingType.color} />
		{#if trainingType.description}
			<p class="training-description">{trainingType.description}</p>
		{/if}
		{#if neverExpires}
			<span class="never-expires-badge">Never Expires</span>
		{:else if expirationDateOnly}
			<span class="never-expires-badge">Expiration date per person</span>
		{/if}
	</div>

	{#if canBeExempted && onToggleExempt}
		<div class="exempt-toggle">
			<button
				class="btn {isExempt ? 'btn-danger' : 'btn-secondary'} btn-sm"
				onclick={() => onToggleExempt(!isExempt)}
			>
				{isExempt ? 'Remove Exemption' : 'Mark as Exempt'}
			</button>
			{#if isExempt}
				<Badge label="Exempt" color="#9ca3af" />
			{/if}
		</div>
	{/if}

	{#if isExempt}
		<div class="exempt-notice">
			<p>This person is exempt from this training requirement.</p>
		</div>
	{:else if expirationDateOnly}
		<!-- Expiration-date-only: enter the expiration date directly -->
		<div class="form-group">
			<label class="label" for="expiration-date">License / Certification Expiration Date</label>
			<input
				type="date"
				id="expiration-date"
				class="input"
				bind:value={directExpirationDate}
				required
			/>
			<span class="field-hint">Enter the expiration date shown on the license or certificate</span>
		</div>
	{:else if neverExpires}
		<!-- Never-expires training: checkbox to mark complete, date optional -->
		<div class="form-group checkbox-group">
			<label class="checkbox-label">
				<input type="checkbox" bind:checked={isComplete} />
				<span class="checkbox-text">Mark as Complete</span>
			</label>
		</div>

		<div class="form-group">
			<label class="label" for="completion-date">Completion Date (Optional)</label>
			<input
				type="date"
				id="completion-date"
				class="input"
				bind:value={completionDate}
				disabled={!isComplete}
			/>
			<span class="field-hint">Record when training was completed for your records</span>
		</div>
	{:else}
		<!-- Expiring training: completion date required, expiration auto-calculated -->
		<div class="form-group">
			<label class="label" for="completion-date">Completion Date</label>
			<input
				type="date"
				id="completion-date"
				class="input"
				bind:value={completionDate}
				required
			/>
		</div>
	{/if}

	{#if !isExempt}
		<div class="preview-row">
			<div class="preview-item">
				<span class="preview-label">Expiration:</span>
				<span class="preview-value">
					{#if neverExpires}
						Never expires
					{:else}
						{previewExpirationDate ?? (expirationDateOnly ? 'Enter expiration date' : 'Set completion date')}
					{/if}
				</span>
			</div>
			<div class="preview-item">
				<span class="preview-label">Status:</span>
				<Badge label={previewStatus.label} color={previewStatus.color} />
			</div>
		</div>

		<div class="form-group">
			<label class="label" for="notes">Notes (optional)</label>
			<textarea
				id="notes"
				class="input textarea"
				bind:value={notes}
				placeholder="Any additional notes..."
				rows="2"
			></textarea>
		</div>

		<div class="form-group">
			<label class="label" for="certificate-url">Certificate URL (optional)</label>
			<input
				type="url"
				id="certificate-url"
				class="input"
				bind:value={certificateUrl}
				placeholder="https://..."
			/>
		</div>
	{/if}

	{#snippet footer()}
		{#if !isExempt && existingTraining}
			<button class="btn btn-danger" onclick={handleRemove}>Delete</button>
		{/if}
		<div class="spacer"></div>
		<button class="btn btn-secondary" onclick={onClose}>{isExempt ? 'Close' : 'Cancel'}</button>
		{#if !isExempt}
			<button class="btn btn-primary" onclick={handleSave} disabled={!canSave || saving}>
				{saving ? 'Saving...' : 'Save'}
			</button>
		{/if}
	{/snippet}
</Modal>

{#if showRemoveConfirm}
	<ConfirmDialog
		title="Delete Training Record"
		message="Are you sure you want to delete this training record?"
		confirmLabel="Delete"
		variant="danger"
		onConfirm={doRemove}
		onCancel={() => (showRemoveConfirm = false)}
	/>
{/if}

<style>
	.person-info {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		margin-bottom: var(--spacing-md);
		padding: var(--spacing-sm);
		background: var(--color-bg);
		border-radius: var(--radius-md);
	}

	.person-rank {
		font-weight: 600;
		color: var(--color-text-muted);
	}

	.person-name {
		font-weight: 500;
	}

	.training-info {
		margin-bottom: var(--spacing-md);
	}

	.training-description {
		margin-top: var(--spacing-xs);
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
	}

	.preview-row {
		display: flex;
		gap: var(--spacing-lg);
		margin-bottom: var(--spacing-md);
		padding: var(--spacing-sm);
		background: var(--color-bg);
		border-radius: var(--radius-md);
	}

	.preview-item {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
	}

	.preview-label {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
	}

	.preview-value {
		font-weight: 500;
	}

	.textarea {
		resize: vertical;
		min-height: 60px;
	}

	.never-expires-badge {
		display: inline-block;
		margin-left: var(--spacing-sm);
		padding: 2px var(--spacing-xs);
		background: var(--color-bg);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font-size: var(--font-size-xs);
		color: var(--color-text-muted);
	}

	.checkbox-group {
		margin-bottom: var(--spacing-md);
	}

	.checkbox-label {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		cursor: pointer;
		padding: var(--spacing-sm);
		background: var(--color-bg);
		border-radius: var(--radius-md);
		border: 1px solid var(--color-border);
	}

	.checkbox-label:hover {
		border-color: var(--color-primary);
	}

	.checkbox-label input[type='checkbox'] {
		width: 18px;
		height: 18px;
		accent-color: var(--color-primary);
		cursor: pointer;
	}

	.checkbox-text {
		font-weight: 500;
	}

	.field-hint {
		display: block;
		margin-top: var(--spacing-xs);
		font-size: var(--font-size-xs);
		color: var(--color-text-muted);
	}

	.exempt-toggle {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		margin-bottom: var(--spacing-md);
		padding: var(--spacing-sm);
		background: var(--color-bg);
		border-radius: var(--radius-md);
		border: 1px solid var(--color-border);
	}

	.exempt-notice {
		padding: var(--spacing-md);
		background: rgba(156, 163, 175, 0.1);
		border: 1px solid #9ca3af;
		border-radius: var(--radius-md);
		margin-bottom: var(--spacing-md);
	}

	.exempt-notice p {
		margin: 0;
		font-size: var(--font-size-sm);
		color: var(--color-text-secondary);
	}
</style>
