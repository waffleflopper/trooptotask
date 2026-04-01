<script lang="ts">
	import type { Personnel } from '$lib/types';
	import type { TrainingType, PersonnelTraining } from '$features/training/training.types';
	import { calculateExpirationDate, getTrainingStatus } from '$features/training/utils/trainingStatus';
	import { formatDate } from '$lib/utils/dates';
	import { toastStore } from '$lib/stores/toast.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
	import FormField from '$lib/components/ui/FormField.svelte';

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

	let {
		person,
		trainingType,
		existingTraining,
		onSave,
		onRemove,
		onClose,
		canBeExempted = false,
		isExempt = false,
		onToggleExempt
	}: Props = $props();

	const neverExpires = $derived(trainingType.expirationMonths === null && !trainingType.expirationDateOnly);
	const expirationDateOnly = $derived(trainingType.expirationDateOnly);
	const todayStr = formatDate(new Date());

	// Initialize state
	let isComplete = $state(false);
	let completionDate = $state('');
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
			: completionDate
				? calculateExpirationDate(completionDate, trainingType.expirationMonths)
				: null
	);

	const previewTraining = $derived({
		id: existingTraining?.id ?? '',
		personnelId: person.id,
		trainingTypeId: trainingType.id,
		completionDate: expirationDateOnly ? null : completionDate || null,
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

	const canSave = $derived(expirationDateOnly ? !!directExpirationDate : neverExpires ? isComplete : !!completionDate);

	async function handleSave() {
		if (!canSave) return;
		const saveData = {
			personnelId: person.id,
			trainingTypeId: trainingType.id,
			completionDate: expirationDateOnly ? null : completionDate || null,
			expirationDate: previewExpirationDate,
			notes: notes.trim() || null,
			certificateUrl: certificateUrl.trim() || null
		};
		const isUpdate = !!existingTraining;
		onClose();
		try {
			await onSave(saveData);
			toastStore.success(isUpdate ? 'Training record updated' : 'Training record saved');
		} catch {
			toastStore.error('Failed to save training record');
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
				type="button"
				onclick={() => onToggleExempt(!isExempt)}
			>
				{isExempt ? 'Remove Exemption' : 'Mark as Exempt'}
			</button>
			{#if isExempt}
				<Badge label="Exempt" variant="outlined" />
			{/if}
		</div>
	{/if}

	{#if isExempt}
		<div class="exempt-notice">
			<p>This person is exempt from this training requirement.</p>
		</div>
	{:else if expirationDateOnly}
		<!-- Expiration-date-only: enter the expiration date directly -->
		<FormField
			label="License / Certification Expiration Date"
			id="expiration-date"
			type="date"
			required
			hint="Enter the expiration date shown on the license or certificate"
			bind:value={directExpirationDate}
		/>
	{:else if neverExpires}
		<!-- Never-expires training: checkbox to mark complete, date optional -->
		<div class="form-group checkbox-group">
			<label class="checkbox-label">
				<input type="checkbox" bind:checked={isComplete} />
				<span class="checkbox-text">Mark as Complete</span>
			</label>
		</div>

		<FormField
			label="Completion Date (Optional)"
			id="completion-date"
			type="date"
			disabled={!isComplete}
			hint="Record when training was completed for your records"
			bind:value={completionDate}
		/>
	{:else}
		<!-- Expiring training: completion date required, expiration auto-calculated -->
		<FormField label="Completion Date" id="completion-date" type="date" required bind:value={completionDate} />
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

		<FormField
			label="Notes (optional)"
			id="notes"
			inputElement="textarea"
			placeholder="Any additional notes..."
			rows={2}
			bind:value={notes}
		/>

		<FormField
			label="Certificate URL (optional)"
			id="certificate-url"
			type="url"
			placeholder="https://..."
			bind:value={certificateUrl}
		/>
	{/if}

	{#snippet footer()}
		{#if !isExempt && existingTraining}
			<button class="btn btn-danger" type="button" onclick={handleRemove}>Delete</button>
		{/if}
		<div class="spacer"></div>
		<button class="btn btn-secondary" type="button" onclick={onClose}>{isExempt ? 'Close' : 'Cancel'}</button>
		{#if !isExempt}
			<button
				class="btn btn-primary"
				type="button"
				data-testid="training-save"
				onclick={handleSave}
				disabled={!canSave}
			>
				Save
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
		gap: var(--sp-3);
		margin-bottom: var(--sp-4);
		padding: var(--sp-3) var(--sp-4);
		background: color-mix(in srgb, var(--surface-subtle) 46%, var(--surface-panel) 54%);
		border: var(--border-thin);
		border-radius: var(--radius-lg);
	}

	.person-rank {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: var(--letter-spacing-mono);
		text-transform: uppercase;
		color: var(--amber-dark);
	}

	.person-name {
		font-size: var(--text-sm);
		font-weight: var(--font-weight-semibold);
		color: var(--text-primary);
	}

	.training-info {
		display: flex;
		flex-direction: column;
		align-items: start;
		gap: var(--sp-3);
		margin-bottom: var(--sp-4);
		padding: var(--sp-4);
		border: var(--border-thin);
		border-radius: var(--radius-lg);
		background: var(--surface-panel);
	}

	.training-description {
		margin: 0;
		font-size: var(--text-sm);
		line-height: 1.65;
		color: var(--text-secondary);
	}

	.preview-row {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-4);
		margin-bottom: var(--sp-4);
		padding: var(--sp-4);
		background: color-mix(in srgb, var(--surface-subtle) 46%, var(--surface-panel) 54%);
		border: var(--border-thin);
		border-radius: var(--radius-lg);
	}

	.preview-item {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
	}

	.preview-label {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--text-secondary);
		letter-spacing: var(--letter-spacing-mono);
		text-transform: uppercase;
	}

	.preview-value {
		font-size: var(--text-sm);
		font-weight: var(--font-weight-semibold);
		color: var(--text-primary);
	}

	.never-expires-badge {
		display: inline-block;
		padding: var(--sp-1) var(--sp-2);
		background: color-mix(in srgb, var(--surface-subtle) 62%, var(--surface-panel) 38%);
		border: var(--border-thin);
		border-radius: var(--radius-sm);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--text-secondary);
		letter-spacing: var(--letter-spacing-mono);
		text-transform: uppercase;
	}

	.checkbox-group {
		margin-bottom: var(--sp-4);
	}

	.checkbox-label {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
		cursor: pointer;
		padding: var(--sp-3) var(--sp-4);
		background: color-mix(in srgb, var(--surface-subtle) 46%, var(--surface-panel) 54%);
		border-radius: var(--radius-lg);
		border: var(--border-thin);
	}

	.checkbox-label:hover {
		border-color: var(--border-strong);
	}

	.checkbox-label input[type='checkbox'] {
		width: 18px;
		height: 18px;
		accent-color: var(--amber);
		cursor: pointer;
	}

	.checkbox-text {
		font-size: var(--text-sm);
		font-weight: var(--font-weight-semibold);
	}

	.exempt-toggle {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
		margin-bottom: var(--sp-4);
		padding: var(--sp-3) var(--sp-4);
		background: color-mix(in srgb, var(--surface-subtle) 46%, var(--surface-panel) 54%);
		border-radius: var(--radius-lg);
		border: var(--border-thin);
	}

	.exempt-notice {
		padding: var(--sp-4);
		background: color-mix(in srgb, var(--surface-subtle) 60%, var(--surface-panel) 40%);
		border: var(--border-thin);
		border-radius: var(--radius-lg);
		margin-bottom: var(--sp-4);
	}

	.exempt-notice p {
		margin: 0;
		font-size: var(--text-sm);
		line-height: 1.65;
		color: var(--text-secondary);
	}
</style>
