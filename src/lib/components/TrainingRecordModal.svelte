<script lang="ts">
	import type { Personnel, TrainingType, PersonnelTraining } from '../types';
	import { calculateExpirationDate, getTrainingStatus } from '../utils/trainingStatus';

	interface Props {
		person: Personnel;
		trainingType: TrainingType;
		existingTraining: PersonnelTraining | undefined;
		onSave: (data: Omit<PersonnelTraining, 'id'>) => void;
		onRemove: (id: string) => void;
		onClose: () => void;
	}

	let { person, trainingType, existingTraining, onSave, onRemove, onClose }: Props = $props();

	// For never-expires training, date is optional
	const neverExpires = trainingType.expirationMonths === null;

	// Initialize state - for never-expires, we might have a record without a date
	let isComplete = $state(!!existingTraining);
	let completionDate = $state(existingTraining?.completionDate ?? (neverExpires ? '' : new Date().toISOString().split('T')[0]));
	let notes = $state(existingTraining?.notes ?? '');
	let certificateUrl = $state(existingTraining?.certificateUrl ?? '');

	const previewExpirationDate = $derived(
		completionDate ? calculateExpirationDate(completionDate, trainingType.expirationMonths) : null
	);

	const previewTraining = $derived({
		id: existingTraining?.id ?? '',
		personnelId: person.id,
		trainingTypeId: trainingType.id,
		completionDate: completionDate || null,
		expirationDate: previewExpirationDate,
		notes,
		certificateUrl
	} as PersonnelTraining);

	// For never-expires training, show "Current" if marked complete even without date
	const previewStatus = $derived(() => {
		if (neverExpires && isComplete) {
			// Create a fake training record to simulate the complete state
			return getTrainingStatus(previewTraining, trainingType, person);
		}
		if (!neverExpires && !completionDate) {
			// For expiring training without date, show not completed
			return getTrainingStatus(undefined, trainingType, person);
		}
		return getTrainingStatus(previewTraining, trainingType, person);
	});

	// Validation: can only save if complete checkbox is checked (for never-expires) or date is set (for expiring)
	const canSave = $derived(neverExpires ? isComplete : !!completionDate);

	function handleSave() {
		if (!canSave) return;

		onSave({
			personnelId: person.id,
			trainingTypeId: trainingType.id,
			completionDate: completionDate || null,
			expirationDate: previewExpirationDate,
			notes: notes.trim() || null,
			certificateUrl: certificateUrl.trim() || null
		});
		onClose();
	}

	function handleRemove() {
		if (existingTraining && confirm('Are you sure you want to remove this training record?')) {
			onRemove(existingTraining.id);
			onClose();
		}
	}
</script>

<div class="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="training-record-title" tabindex="-1" onkeydown={(e) => e.key === 'Escape' && onClose()}>
	<button class="modal-backdrop" onclick={onClose} tabindex="-1" aria-label="Close dialog"></button>
	<div class="modal" style="width: 450px;" role="document">
		<div class="modal-header">
			<h2 id="training-record-title">{existingTraining ? 'Edit' : 'Add'} Training Record</h2>
			<button class="btn btn-secondary btn-sm" onclick={onClose}>&times;</button>
		</div>

		<div class="modal-body">
			<div class="person-info">
				<span class="person-rank">{person.rank}</span>
				<span class="person-name">{person.lastName}, {person.firstName}</span>
			</div>

			<div class="training-info">
				<span class="training-badge" style="background-color: {trainingType.color}">
					{trainingType.name}
				</span>
				{#if trainingType.description}
					<p class="training-description">{trainingType.description}</p>
				{/if}
				{#if neverExpires}
					<span class="never-expires-badge">Never Expires</span>
				{/if}
			</div>

			{#if neverExpires}
				<!-- Never-expires training: checkbox to mark complete, date optional -->
				<div class="form-group checkbox-group">
					<label class="checkbox-label">
						<input
							type="checkbox"
							bind:checked={isComplete}
						/>
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
				<!-- Expiring training: date required -->
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

			<div class="preview-row">
				<div class="preview-item">
					<span class="preview-label">Expiration:</span>
					<span class="preview-value">
						{#if neverExpires}
							Never expires
						{:else}
							{previewExpirationDate ?? 'Set completion date'}
						{/if}
					</span>
				</div>
				<div class="preview-item">
					<span class="preview-label">Status:</span>
					<span class="status-badge" style="background-color: {previewStatus().color}">
						{previewStatus().label}
					</span>
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
		</div>

		<div class="modal-footer">
			{#if existingTraining}
				<button class="btn btn-danger" onclick={handleRemove}>Remove</button>
			{/if}
			<div class="spacer"></div>
			<button class="btn btn-secondary" onclick={onClose}>Cancel</button>
			<button class="btn btn-primary" onclick={handleSave} disabled={!canSave}>Save</button>
		</div>
	</div>
</div>

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

	.training-badge {
		display: inline-block;
		padding: var(--spacing-xs) var(--spacing-sm);
		border-radius: var(--radius-sm);
		color: white;
		font-weight: 500;
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

	.status-badge {
		display: inline-block;
		padding: var(--spacing-xs) var(--spacing-sm);
		border-radius: var(--radius-sm);
		color: white;
		font-weight: 500;
		font-size: var(--font-size-sm);
	}

	.textarea {
		resize: vertical;
		min-height: 60px;
	}

	.modal-footer {
		display: flex;
		gap: var(--spacing-sm);
	}

	.spacer {
		flex: 1;
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

	.checkbox-label input[type="checkbox"] {
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
</style>
