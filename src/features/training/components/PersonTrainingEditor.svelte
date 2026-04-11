<script lang="ts">
	import type { Personnel } from '$lib/types';
	import type { TrainingType, PersonnelTraining } from '$features/training/training.types';
	import { calculateExpirationDate, getTrainingStatus } from '$features/training/utils/trainingStatus';
	import { formatDate } from '$lib/utils/dates';
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import { SvelteMap } from 'svelte/reactivity';

	interface TrainingEditState {
		isComplete: boolean;
		completionDate: string;
		directExpirationDate: string;
		notes: string;
		certificateUrl: string;
		isEditing: boolean;
		isDirty: boolean;
	}

	interface Props {
		person: Personnel;
		trainingTypes: TrainingType[];
		trainings: PersonnelTraining[];
		onSave: (data: Omit<PersonnelTraining, 'id'>) => Promise<void>;
		onRemove: (id: string) => Promise<void>;
		onClose: () => void;
		onToggleExempt?: (typeId: string, exempt: boolean) => void;
	}

	let { person, trainingTypes, trainings, onSave, onRemove, onClose, onToggleExempt }: Props = $props();

	// Create a map of existing trainings for this person
	const trainingMap = $derived.by(() => {
		const map = new SvelteMap<string, PersonnelTraining>();
		for (const t of trainings) {
			if (t.personnelId === person.id) {
				map.set(t.trainingTypeId, t);
			}
		}
		return map;
	});

	// Track editing state for each training type
	const editingStates = new SvelteMap<string, TrainingEditState>();

	// Initialize editing states on mount
	$effect(() => {
		editingStates.clear();

		for (const type of trainingTypes) {
			const existing = trainingMap.get(type.id);
			const neverExpires = type.expirationMonths === null && !type.expirationDateOnly;
			editingStates.set(type.id, {
				isComplete: !!existing,
				completionDate:
					existing?.completionDate ?? (neverExpires || type.expirationDateOnly ? '' : formatDate(new Date())),
				directExpirationDate: existing?.expirationDate ?? '',
				notes: existing?.notes ?? '',
				certificateUrl: existing?.certificateUrl ?? '',
				isEditing: false,
				isDirty: false
			});
		}
	});

	// Get training status for display
	function getStatusInfo(typeId: string) {
		const type = trainingTypes.find((t) => t.id === typeId);
		const training = trainingMap.get(typeId);
		if (!type) return { status: 'not-required' as const, label: 'N/A', color: '#6b7280' };
		return getTrainingStatus(training, type, person);
	}

	// Calculate summary stats
	const stats = $derived.by(() => {
		let current = 0,
			warningYellow = 0,
			warningOrange = 0,
			expired = 0,
			notCompleted = 0;

		for (const type of trainingTypes) {
			const status = getStatusInfo(type.id);
			switch (status.label) {
				case 'Current':
					current++;
					break;
				case 'Under 60d':
					warningYellow++;
					break;
				case 'Under 30d':
					warningOrange++;
					break;
				case 'Expired':
					expired++;
					break;
				case 'Not Done':
					notCompleted++;
					break;
				case 'N/A':
					break;
				default:
					current++;
					break;
			}
		}

		return { current, warningYellow, warningOrange, expired, notCompleted };
	});

	function toggleEdit(typeId: string) {
		const state = editingStates.get(typeId);
		if (state) {
			editingStates.set(typeId, { ...state, isEditing: !state.isEditing });
		}
	}

	function updateField(
		typeId: string,
		field: 'completionDate' | 'directExpirationDate' | 'notes' | 'certificateUrl' | 'isComplete',
		value: string | boolean
	) {
		const state = editingStates.get(typeId);
		if (state) {
			editingStates.set(typeId, { ...state, [field]: value, isDirty: true });
		}
	}

	async function markCompletedToday(typeId: string) {
		const type = trainingTypes.find((t) => t.id === typeId);
		if (!type) return;

		const today = formatDate(new Date());
		const expirationDate = calculateExpirationDate(today, type.expirationMonths);

		await onSave({
			personnelId: person.id,
			trainingTypeId: typeId,
			completionDate: today,
			expirationDate,
			notes: null,
			certificateUrl: null
		});

		// Update local state
		editingStates.set(typeId, {
			isComplete: true,
			completionDate: today,
			directExpirationDate: '',
			notes: '',
			certificateUrl: '',
			isEditing: false,
			isDirty: false
		});
	}

	// Mark as complete without a date (for never-expires training)
	async function markComplete(typeId: string) {
		const type = trainingTypes.find((t) => t.id === typeId);
		if (!type || type.expirationMonths !== null) return;

		await onSave({
			personnelId: person.id,
			trainingTypeId: typeId,
			completionDate: null,
			expirationDate: null,
			notes: null,
			certificateUrl: null
		});

		// Update local state
		editingStates.set(typeId, {
			isComplete: true,
			completionDate: '',
			directExpirationDate: '',
			notes: '',
			certificateUrl: '',
			isEditing: false,
			isDirty: false
		});
	}

	async function saveTraining(typeId: string) {
		const state = editingStates.get(typeId);
		const type = trainingTypes.find((t) => t.id === typeId);
		if (!state || !type) return;

		const neverExpires = type.expirationMonths === null && !type.expirationDateOnly;

		if (type.expirationDateOnly) {
			// Expiration-date-only: require the expiration date, completionDate is null
			if (!state.directExpirationDate) return;
		} else if (!neverExpires && !state.completionDate) {
			// For expiring training, date is required
			return;
		}

		const completionDate = type.expirationDateOnly ? null : state.completionDate || null;
		const expirationDate = type.expirationDateOnly
			? state.directExpirationDate || null
			: calculateExpirationDate(completionDate, type.expirationMonths);

		await onSave({
			personnelId: person.id,
			trainingTypeId: typeId,
			completionDate,
			expirationDate,
			notes: state.notes.trim() || null,
			certificateUrl: state.certificateUrl.trim() || null
		});

		// Mark as saved
		editingStates.set(typeId, { ...state, isComplete: true, isEditing: false, isDirty: false });
	}

	let confirmRemoveTypeId = $state<string | null>(null);
	let showMarkAllConfirm = $state(false);

	function removeTraining(typeId: string) {
		confirmRemoveTypeId = typeId;
	}

	async function doRemoveTraining() {
		const typeId = confirmRemoveTypeId;
		if (!typeId) return;
		confirmRemoveTypeId = null;

		const existing = trainingMap.get(typeId);
		if (!existing) return;

		const type = trainingTypes.find((t) => t.id === typeId);
		const neverExpires = type?.expirationMonths === null && !type?.expirationDateOnly;

		await onRemove(existing.id);

		// Reset local state
		editingStates.set(typeId, {
			isComplete: false,
			completionDate: neverExpires || type?.expirationDateOnly ? '' : formatDate(new Date()),
			directExpirationDate: '',
			notes: '',
			certificateUrl: '',
			isEditing: false,
			isDirty: false
		});
	}

	async function markAllCompletedToday() {
		showMarkAllConfirm = true;
	}

	async function doMarkAllCompleted() {
		showMarkAllConfirm = false;
		// Skip expiration-date-only types — they need individual expiration dates
		const applicableTypes = trainingTypes.filter((t) => !t.expirationDateOnly);

		const today = formatDate(new Date());

		for (const type of applicableTypes) {
			const expirationDate = calculateExpirationDate(today, type.expirationMonths);
			await onSave({
				personnelId: person.id,
				trainingTypeId: type.id,
				completionDate: today,
				expirationDate,
				notes: null,
				certificateUrl: null
			});
		}

		for (const type of applicableTypes) {
			editingStates.set(type.id, {
				isComplete: true,
				completionDate: today,
				directExpirationDate: '',
				notes: '',
				certificateUrl: '',
				isEditing: false,
				isDirty: false
			});
		}
	}

	function cancelEdit(typeId: string) {
		const existing = trainingMap.get(typeId);
		const type = trainingTypes.find((t) => t.id === typeId);
		const neverExpires = type?.expirationMonths === null && !type?.expirationDateOnly;
		editingStates.set(typeId, {
			isComplete: !!existing,
			completionDate:
				existing?.completionDate ?? (neverExpires || type?.expirationDateOnly ? '' : formatDate(new Date())),
			directExpirationDate: existing?.expirationDate ?? '',
			notes: existing?.notes ?? '',
			certificateUrl: existing?.certificateUrl ?? '',
			isEditing: false,
			isDirty: false
		});
	}
</script>

<Modal title="Training Records" {onClose} width="600px" titleId="person-training-title">
	{#snippet headerActions()}
		<div class="person-badge">
			<span class="person-rank">{person.rank}</span>
			<span class="person-name">{person.lastName}, {person.firstName}</span>
		</div>
	{/snippet}
	{#snippet footer()}
		<button class="btn btn-secondary" type="button" onclick={onClose}>Close</button>
	{/snippet}

	<div class="stats-summary">
		<div class="stat current">
			<span class="stat-value">{stats.current}</span>
			<span class="stat-label">Current</span>
		</div>
		<div class="stat warning-yellow">
			<span class="stat-value">{stats.warningYellow}</span>
			<span class="stat-label">&lt;60d</span>
		</div>
		<div class="stat warning-orange">
			<span class="stat-value">{stats.warningOrange}</span>
			<span class="stat-label">&lt;30d</span>
		</div>
		<div class="stat expired">
			<span class="stat-value">{stats.expired}</span>
			<span class="stat-label">Expired</span>
		</div>
		<div class="stat not-done">
			<span class="stat-value">{stats.notCompleted}</span>
			<span class="stat-label">Not Done</span>
		</div>
	</div>

	<div class="bulk-actions">
		<button class="btn btn-primary btn-sm" type="button" onclick={markAllCompletedToday}>
			Mark All Completed Today
		</button>
	</div>

	<div class="modal-body">
		<div class="training-list">
			{#each trainingTypes as type (type.id)}
				{@const existing = trainingMap.get(type.id)}
				{@const status = getStatusInfo(type.id)}
				{@const state = editingStates.get(type.id)}
				{@const isExempt = type.canBeExempted && type.exemptPersonnelIds.includes(person.id)}
				<div class="training-item" class:has-record={!!existing} class:editing={state?.isEditing}>
					<div class="training-header">
						<div class="training-info">
							<span class="training-badge" style="background-color: {type.color}">
								{type.name}
							</span>
							<span class="status-badge" style="background-color: {status.color}" data-status={status.status}>
								{status.label}
							</span>
						</div>
						<div class="training-actions">
							{#if !state?.isEditing}
								{#if type.canBeExempted && onToggleExempt}
									<button
										class="btn btn-sm {isExempt ? 'btn-danger' : 'btn-secondary'}"
										type="button"
										onclick={() => onToggleExempt(type.id, !isExempt)}
										title={isExempt ? 'Remove exemption' : 'Mark as exempt'}
									>
										{isExempt ? 'Unexempt' : 'Exempt'}
									</button>
								{/if}
								{#if !isExempt}
									{@const neverExpires = type.expirationMonths === null && !type.expirationDateOnly}
									{#if type.expirationDateOnly}
										<!-- Expiration-date-only: no quick action, must use Edit -->
									{:else if neverExpires && !existing}
										<button
											class="btn btn-primary btn-sm"
											type="button"
											onclick={() => markComplete(type.id)}
											title="Mark as complete"
										>
											Complete
										</button>
									{:else}
										<button
											class="btn btn-primary btn-sm"
											type="button"
											onclick={() => markCompletedToday(type.id)}
											title="Mark as completed today"
										>
											Today
										</button>
									{/if}
									<button class="btn btn-secondary btn-sm" type="button" onclick={() => toggleEdit(type.id)}>
										{existing ? 'Edit' : 'Add'}
									</button>
									{#if existing}
										<button
											class="btn btn-danger btn-sm"
											type="button"
											onclick={() => removeTraining(type.id)}
											title="Remove record"
										>
											&times;
										</button>
									{/if}
								{/if}
							{/if}
						</div>
					</div>

					{#if existing && !state?.isEditing}
						<div class="training-details">
							{#if existing.completionDate}
								<span class="detail-item">
									<span class="detail-label">Completed:</span>
									<span class="detail-value">{existing.completionDate}</span>
								</span>
							{:else}
								<span class="detail-item">
									<span class="detail-label">Status:</span>
									<span class="detail-value">Complete (no date)</span>
								</span>
							{/if}
							{#if existing.expirationDate}
								<span class="detail-item">
									<span class="detail-label">Expires:</span>
									<span class="detail-value">{existing.expirationDate}</span>
								</span>
							{/if}
							{#if existing.notes}
								<span class="detail-item notes">
									<span class="detail-label">Notes:</span>
									<span class="detail-value">{existing.notes}</span>
								</span>
							{/if}
						</div>
					{/if}

					{#if state?.isEditing}
						{@const neverExpires = type.expirationMonths === null && !type.expirationDateOnly}
						<div class="edit-form">
							{#if type.expirationDateOnly}
								<div class="form-row">
									<div class="form-group">
										<label class="label" for="date-{type.id}">Expiration Date</label>
										<input
											type="date"
											id="date-{type.id}"
											class="input"
											value={state.directExpirationDate}
											oninput={(e) => updateField(type.id, 'directExpirationDate', e.currentTarget.value)}
											required
										/>
									</div>
									<div class="form-group expiration-preview">
										<span class="label">Status:</span>
										<span class="preview-value">
											{state.directExpirationDate
												? state.directExpirationDate >= formatDate(new Date())
													? 'Current'
													: 'Expired'
												: 'Set date'}
										</span>
									</div>
								</div>
							{:else if neverExpires}
								<div class="form-group checkbox-group">
									<label class="checkbox-label">
										<input
											type="checkbox"
											checked={state.isComplete}
											onchange={(e) => updateField(type.id, 'isComplete', e.currentTarget.checked)}
										/>
										<span class="checkbox-text">Mark as Complete</span>
									</label>
								</div>
								<div class="form-row">
									<div class="form-group">
										<label class="label" for="date-{type.id}">Completion Date (Optional)</label>
										<input
											type="date"
											id="date-{type.id}"
											class="input"
											value={state.completionDate}
											oninput={(e) => updateField(type.id, 'completionDate', e.currentTarget.value)}
											disabled={!state.isComplete}
										/>
									</div>
									<div class="form-group expiration-preview">
										<span class="label">Expires:</span>
										<span class="preview-value">Never</span>
									</div>
								</div>
							{:else}
								<div class="form-row">
									<div class="form-group">
										<label class="label" for="date-{type.id}">Completion Date</label>
										<input
											type="date"
											id="date-{type.id}"
											class="input"
											value={state.completionDate}
											oninput={(e) => updateField(type.id, 'completionDate', e.currentTarget.value)}
											required
										/>
									</div>
									<div class="form-group expiration-preview">
										<span class="label">Expires:</span>
										<span class="preview-value">
											{calculateExpirationDate(state.completionDate, type.expirationMonths) ?? 'Set date'}
										</span>
									</div>
								</div>
							{/if}
							<div class="form-group">
								<label class="label" for="notes-{type.id}">Notes</label>
								<input
									type="text"
									id="notes-{type.id}"
									class="input"
									value={state.notes}
									oninput={(e) => updateField(type.id, 'notes', e.currentTarget.value)}
									placeholder="Optional notes..."
								/>
							</div>
							<div class="form-group">
								<label class="label" for="cert-{type.id}">Certificate URL</label>
								<input
									type="url"
									id="cert-{type.id}"
									class="input"
									value={state.certificateUrl}
									oninput={(e) => updateField(type.id, 'certificateUrl', e.currentTarget.value)}
									placeholder="https://..."
								/>
							</div>
							<div class="edit-actions">
								<button class="btn btn-secondary btn-sm" type="button" onclick={() => cancelEdit(type.id)}>
									Cancel
								</button>
								<button
									class="btn btn-primary btn-sm"
									type="button"
									onclick={() => saveTraining(type.id)}
									disabled={type.expirationDateOnly
										? !state.directExpirationDate
										: neverExpires
											? !state.isComplete
											: !state.completionDate}
								>
									Save
								</button>
							</div>
						</div>
					{/if}
				</div>
			{/each}
		</div>
	</div>
</Modal>

{#if confirmRemoveTypeId}
	<ConfirmDialog
		title="Remove Training Record"
		message="Are you sure you want to remove this training record?"
		confirmLabel="Delete"
		variant="danger"
		onConfirm={doRemoveTraining}
		onCancel={() => (confirmRemoveTypeId = null)}
	/>
{/if}

{#if showMarkAllConfirm}
	{@const count = trainingTypes.filter((t) => !t.expirationDateOnly).length}
	<ConfirmDialog
		title="Mark All Completed"
		message="Mark {count} trainings as completed today? (Expiration-date-only trainings must be set individually)"
		confirmLabel="Mark All"
		variant="warning"
		onConfirm={doMarkAllCompleted}
		onCancel={() => (showMarkAllConfirm = false)}
	/>
{/if}

<style>
	.person-badge {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
		font-size: var(--text-sm);
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
		font-weight: var(--font-weight-semibold);
	}

	.stats-summary {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(92px, 1fr));
		gap: var(--sp-3);
		padding: var(--sp-4) var(--sp-5);
		background: color-mix(in srgb, var(--surface-subtle) 46%, var(--surface-panel) 54%);
		border-bottom: var(--border-thin);
	}

	.stat {
		text-align: center;
		padding: var(--sp-3);
		border-radius: var(--radius-md);
		min-width: 50px;
		border: var(--border-thin);
	}

	.stat.current {
		background: color-mix(in srgb, var(--success-bg) 82%, var(--surface-panel) 18%);
		border-color: color-mix(in srgb, var(--success) 28%, var(--border-default));
	}
	.stat.warning-yellow {
		background: color-mix(in srgb, var(--amber-light) 84%, var(--surface-panel) 16%);
		border-color: color-mix(in srgb, var(--amber) 28%, var(--border-default));
	}
	.stat.warning-orange {
		background: color-mix(in srgb, var(--warning-bg) 84%, var(--surface-panel) 16%);
		border-color: color-mix(in srgb, var(--warning) 28%, var(--border-default));
	}
	.stat.expired {
		background: color-mix(in srgb, var(--danger-bg) 84%, var(--surface-panel) 16%);
		border-color: color-mix(in srgb, var(--danger) 28%, var(--border-default));
	}
	.stat.not-done {
		background: color-mix(in srgb, var(--surface-subtle) 66%, var(--surface-panel) 34%);
		border-color: var(--border-default);
	}

	.stat-value {
		display: block;
		font-family: var(--font-display);
		font-weight: var(--font-weight-display);
		font-size: clamp(1.45rem, 1.15rem + 0.35vw, 1.7rem);
	}

	.stat-label {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--text-secondary);
		letter-spacing: var(--letter-spacing-mono);
		text-transform: uppercase;
	}

	.bulk-actions {
		display: flex;
		justify-content: flex-end;
		padding: var(--sp-4) var(--sp-5);
		border-bottom: var(--border-thin);
	}

	.training-list {
		display: flex;
		flex-direction: column;
		gap: var(--sp-3);
	}

	.training-item {
		border: var(--border-thin);
		border-radius: var(--radius-lg);
		background: var(--surface-panel);
		overflow: hidden;
	}

	.training-item.has-record {
		border-color: color-mix(in srgb, var(--amber) 20%, var(--border-default));
	}

	.training-item.editing {
		border-color: color-mix(in srgb, var(--amber) 34%, var(--border-default));
	}

	.training-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: var(--sp-3);
		padding: var(--sp-3) var(--sp-4);
		background: color-mix(in srgb, var(--surface-subtle) 42%, var(--surface-panel) 58%);
	}

	.training-info {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		flex-wrap: wrap;
	}

	.training-badge {
		padding: var(--sp-2) var(--sp-3);
		border-radius: var(--radius-sm);
		color: white;
		font-family: var(--font-mono);
		font-weight: var(--font-weight-semibold);
		font-size: var(--text-xs);
		letter-spacing: var(--letter-spacing-mono);
		text-transform: uppercase;
	}

	.status-badge {
		padding: var(--sp-1) var(--sp-2);
		border-radius: var(--radius-sm);
		color: white;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.training-actions {
		display: flex;
		gap: var(--sp-2);
		flex-wrap: wrap;
		justify-content: flex-end;
	}

	.training-details {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-4);
		padding: var(--sp-3) var(--sp-4);
		font-size: var(--text-sm);
	}

	.detail-item {
		display: flex;
		gap: var(--sp-1);
	}

	.detail-item.notes {
		width: 100%;
	}

	.detail-label {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--text-secondary);
		letter-spacing: var(--letter-spacing-mono);
		text-transform: uppercase;
	}

	.detail-value {
		font-weight: var(--font-weight-semibold);
	}

	.edit-form {
		padding: var(--sp-4);
		background: color-mix(in srgb, var(--surface-subtle) 26%, var(--surface-panel) 74%);
		border-top: var(--border-thin);
	}

	.form-row {
		display: flex;
		gap: var(--sp-4);
		align-items: flex-end;
		margin-bottom: var(--sp-2);
	}

	.form-row .form-group {
		margin-bottom: 0;
	}

	.form-group {
		margin-bottom: var(--sp-2);
	}

	.form-group:last-of-type {
		margin-bottom: 0;
	}

	.expiration-preview {
		display: flex;
		flex-direction: column;
		gap: var(--sp-1);
	}

	.preview-value {
		font-weight: 500;
		color: var(--text-primary);
	}

	.edit-actions {
		display: flex;
		justify-content: flex-end;
		gap: var(--sp-2);
		margin-top: var(--sp-4);
	}

	.checkbox-group {
		margin-bottom: var(--sp-2);
	}

	.checkbox-label {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		cursor: pointer;
		padding: var(--sp-2);
		background: var(--surface-page);
		border-radius: var(--radius-md);
		border: 1px solid var(--border-default);
	}

	.checkbox-label:hover {
		border-color: var(--amber);
	}

	.checkbox-label input[type='checkbox'] {
		width: 18px;
		height: 18px;
		accent-color: var(--amber);
		cursor: pointer;
	}

	.checkbox-text {
		font-weight: 500;
	}

	/* Mobile Responsive */
	@media (max-width: 640px) {
		.stats-summary {
			flex-wrap: wrap;
			gap: var(--sp-1);
		}

		.stat {
			min-width: 45px;
			padding: var(--sp-1);
		}

		.stat-value {
			font-size: var(--text-ui-sm);
		}

		.training-header {
			flex-direction: column;
			align-items: flex-start;
			gap: var(--sp-2);
		}

		.training-actions {
			width: 100%;
			justify-content: flex-end;
		}

		.form-row {
			flex-direction: column;
		}

		.training-details {
			flex-direction: column;
			gap: var(--sp-1);
		}
	}

	/* Dark mode overrides for light-colored status badges */
	:global([data-theme='dark']) .status-badge[data-status='not-required'] {
		background-color: #4b5563 !important;
	}

	:global([data-theme='dark']) .status-badge[data-status='exempt'] {
		background-color: var(--text-tertiary) !important;
	}
</style>
