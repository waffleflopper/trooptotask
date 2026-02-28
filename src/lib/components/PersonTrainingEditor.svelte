<script lang="ts">
	import type { Personnel, TrainingType, PersonnelTraining } from '../types';
	import { calculateExpirationDate, getTrainingStatus } from '../utils/trainingStatus';
	import { formatDate } from '../utils/dates';
	import ConfirmDialog from './ui/ConfirmDialog.svelte';

	interface Props {
		person: Personnel;
		trainingTypes: TrainingType[];
		trainings: PersonnelTraining[];
		onSave: (data: Omit<PersonnelTraining, 'id'>) => Promise<void>;
		onRemove: (id: string) => Promise<void>;
		onClose: () => void;
	}

	let { person, trainingTypes, trainings, onSave, onRemove, onClose }: Props = $props();

	// Create a map of existing trainings for this person
	const trainingMap = $derived(() => {
		const map = new Map<string, PersonnelTraining>();
		for (const t of trainings) {
			if (t.personnelId === person.id) {
				map.set(t.trainingTypeId, t);
			}
		}
		return map;
	});

	// Track editing state for each training type
	let editingStates = $state<Map<string, {
		isComplete: boolean;
		completionDate: string;
		directExpirationDate: string;
		notes: string;
		certificateUrl: string;
		isEditing: boolean;
		isDirty: boolean;
	}>>(new Map());

	// Initialize editing states on mount
	$effect(() => {
		const states = new Map<string, {
			isComplete: boolean;
			completionDate: string;
			directExpirationDate: string;
			notes: string;
			certificateUrl: string;
			isEditing: boolean;
			isDirty: boolean;
		}>();

		for (const type of trainingTypes) {
			const existing = trainingMap().get(type.id);
			const neverExpires = type.expirationMonths === null && !type.expirationDateOnly;
			states.set(type.id, {
				isComplete: !!existing,
				completionDate: existing?.completionDate ?? (neverExpires || type.expirationDateOnly ? '' : formatDate(new Date())),
				directExpirationDate: existing?.expirationDate ?? '',
				notes: existing?.notes ?? '',
				certificateUrl: existing?.certificateUrl ?? '',
				isEditing: false,
				isDirty: false
			});
		}
		editingStates = states;
	});

	// Get training status for display
	function getStatusInfo(typeId: string) {
		const type = trainingTypes.find(t => t.id === typeId);
		const training = trainingMap().get(typeId);
		if (!type) return { label: 'N/A', color: '#6b7280' };
		return getTrainingStatus(training, type, person);
	}

	// Calculate summary stats
	const stats = $derived(() => {
		let current = 0, warningYellow = 0, warningOrange = 0, expired = 0, notCompleted = 0;

		for (const type of trainingTypes) {
			const status = getStatusInfo(type.id);
			switch (status.label) {
				case 'Current': current++; break;
				case 'Under 60d': warningYellow++; break;
				case 'Under 30d': warningOrange++; break;
				case 'Expired': expired++; break;
				case 'Not Done': notCompleted++; break;
				case 'N/A': break;
				default: current++; break;
			}
		}

		return { current, warningYellow, warningOrange, expired, notCompleted };
	});

	function toggleEdit(typeId: string) {
		const state = editingStates.get(typeId);
		if (state) {
			const newStates = new Map(editingStates);
			newStates.set(typeId, { ...state, isEditing: !state.isEditing });
			editingStates = newStates;
		}
	}

	function updateField(typeId: string, field: 'completionDate' | 'directExpirationDate' | 'notes' | 'certificateUrl' | 'isComplete', value: string | boolean) {
		const state = editingStates.get(typeId);
		if (state) {
			const newStates = new Map(editingStates);
			newStates.set(typeId, { ...state, [field]: value, isDirty: true });
			editingStates = newStates;
		}
	}

	async function markCompletedToday(typeId: string) {
		const type = trainingTypes.find(t => t.id === typeId);
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
		const newStates = new Map(editingStates);
		newStates.set(typeId, {
			isComplete: true,
			completionDate: today,
			directExpirationDate: '',
			notes: '',
			certificateUrl: '',
			isEditing: false,
			isDirty: false
		});
		editingStates = newStates;
	}

	// Mark as complete without a date (for never-expires training)
	async function markComplete(typeId: string) {
		const type = trainingTypes.find(t => t.id === typeId);
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
		const newStates = new Map(editingStates);
		newStates.set(typeId, {
			isComplete: true,
			completionDate: '',
			directExpirationDate: '',
			notes: '',
			certificateUrl: '',
			isEditing: false,
			isDirty: false
		});
		editingStates = newStates;
	}

	async function saveTraining(typeId: string) {
		const state = editingStates.get(typeId);
		const type = trainingTypes.find(t => t.id === typeId);
		if (!state || !type) return;

		const neverExpires = type.expirationMonths === null && !type.expirationDateOnly;

		if (type.expirationDateOnly) {
			// Expiration-date-only: require the expiration date, completionDate is null
			if (!state.directExpirationDate) return;
		} else if (!neverExpires && !state.completionDate) {
			// For expiring training, date is required
			return;
		}

		const completionDate = type.expirationDateOnly ? null : (state.completionDate || null);
		const expirationDate = type.expirationDateOnly
			? (state.directExpirationDate || null)
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
		const newStates = new Map(editingStates);
		newStates.set(typeId, { ...state, isComplete: true, isEditing: false, isDirty: false });
		editingStates = newStates;
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

		const existing = trainingMap().get(typeId);
		if (!existing) return;

		const type = trainingTypes.find(t => t.id === typeId);
		const neverExpires = type?.expirationMonths === null && !type?.expirationDateOnly;

		await onRemove(existing.id);

		// Reset local state
		const newStates = new Map(editingStates);
		newStates.set(typeId, {
			isComplete: false,
			completionDate: neverExpires || type?.expirationDateOnly ? '' : formatDate(new Date()),
			directExpirationDate: '',
			notes: '',
			certificateUrl: '',
			isEditing: false,
			isDirty: false
		});
		editingStates = newStates;
	}

	async function markAllCompletedToday() {
		showMarkAllConfirm = true;
	}

	async function doMarkAllCompleted() {
		showMarkAllConfirm = false;
		// Skip expiration-date-only types — they need individual expiration dates
		const applicableTypes = trainingTypes.filter(t => !t.expirationDateOnly);

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

		// Update local states for applicable types, preserve expiration-date-only states
		const newStates = new Map(editingStates);

		for (const type of applicableTypes) {
			newStates.set(type.id, {
				isComplete: true,
				completionDate: today,
				directExpirationDate: '',
				notes: '',
				certificateUrl: '',
				isEditing: false,
				isDirty: false
			});
		}
		editingStates = newStates;
	}

	function cancelEdit(typeId: string) {
		const existing = trainingMap().get(typeId);
		const type = trainingTypes.find(t => t.id === typeId);
		const neverExpires = type?.expirationMonths === null && !type?.expirationDateOnly;
		const newStates = new Map(editingStates);
		newStates.set(typeId, {
			isComplete: !!existing,
			completionDate: existing?.completionDate ?? (neverExpires || type?.expirationDateOnly ? '' : formatDate(new Date())),
			directExpirationDate: existing?.expirationDate ?? '',
			notes: existing?.notes ?? '',
			certificateUrl: existing?.certificateUrl ?? '',
			isEditing: false,
			isDirty: false
		});
		editingStates = newStates;
	}
</script>

<div class="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="person-training-title" tabindex="-1" onkeydown={(e) => e.key === 'Escape' && onClose()}>
	<button class="modal-backdrop" onclick={onClose} tabindex="-1" aria-label="Close dialog"></button>
	<div class="modal person-training-modal" role="document">
		<div class="modal-header">
			<div class="header-content">
				<h2 id="person-training-title">Training Records</h2>
				<div class="person-badge">
					<span class="person-rank">{person.rank}</span>
					<span class="person-name">{person.lastName}, {person.firstName}</span>
				</div>
			</div>
			<button class="btn btn-secondary btn-sm close-btn" onclick={onClose} aria-label="Close">&times;</button>
		</div>

		<div class="stats-summary">
			<div class="stat current">
				<span class="stat-value">{stats().current}</span>
				<span class="stat-label">Current</span>
			</div>
			<div class="stat warning-yellow">
				<span class="stat-value">{stats().warningYellow}</span>
				<span class="stat-label">&lt;60d</span>
			</div>
			<div class="stat warning-orange">
				<span class="stat-value">{stats().warningOrange}</span>
				<span class="stat-label">&lt;30d</span>
			</div>
			<div class="stat expired">
				<span class="stat-value">{stats().expired}</span>
				<span class="stat-label">Expired</span>
			</div>
			<div class="stat not-done">
				<span class="stat-value">{stats().notCompleted}</span>
				<span class="stat-label">Not Done</span>
			</div>
		</div>

		<div class="bulk-actions">
			<button class="btn btn-primary btn-sm" onclick={markAllCompletedToday}>
				Mark All Completed Today
			</button>
		</div>

		<div class="modal-body">
			<div class="training-list">
				{#each trainingTypes as type (type.id)}
					{@const existing = trainingMap().get(type.id)}
					{@const status = getStatusInfo(type.id)}
					{@const state = editingStates.get(type.id)}
					<div class="training-item" class:has-record={!!existing} class:editing={state?.isEditing}>
						<div class="training-header">
							<div class="training-info">
								<span class="training-badge" style="background-color: {type.color}">
									{type.name}
								</span>
								<span class="status-badge" style="background-color: {status.color}">
									{status.label}
								</span>
							</div>
							<div class="training-actions">
								{#if !state?.isEditing}
									{@const neverExpires = type.expirationMonths === null && !type.expirationDateOnly}
									{#if type.expirationDateOnly}
										<!-- Expiration-date-only: no quick action, must use Edit -->
									{:else if neverExpires && !existing}
										<button
											class="btn btn-primary btn-sm"
											onclick={() => markComplete(type.id)}
											title="Mark as complete"
										>
											Complete
										</button>
									{:else}
										<button
											class="btn btn-primary btn-sm"
											onclick={() => markCompletedToday(type.id)}
											title="Mark as completed today"
										>
											Today
										</button>
									{/if}
									<button
										class="btn btn-secondary btn-sm"
										onclick={() => toggleEdit(type.id)}
									>
										{existing ? 'Edit' : 'Add'}
									</button>
									{#if existing}
										<button
											class="btn btn-danger btn-sm"
											onclick={() => removeTraining(type.id)}
											title="Remove record"
										>
											&times;
										</button>
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
												{state.directExpirationDate ? (state.directExpirationDate >= formatDate(new Date()) ? 'Current' : 'Expired') : 'Set date'}
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
									<button class="btn btn-secondary btn-sm" onclick={() => cancelEdit(type.id)}>
										Cancel
									</button>
									<button
										class="btn btn-primary btn-sm"
										onclick={() => saveTraining(type.id)}
										disabled={type.expirationDateOnly ? !state.directExpirationDate : neverExpires ? !state.isComplete : !state.completionDate}
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

		<div class="modal-footer">
			<button class="btn btn-secondary" onclick={onClose}>Close</button>
		</div>
	</div>
</div>

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
	{@const count = trainingTypes.filter(t => !t.expirationDateOnly).length}
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
	.person-training-modal {
		width: 600px;
		max-width: 95vw;
		max-height: 90vh;
		display: flex;
		flex-direction: column;
	}

	.header-content {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-xs);
	}

	.person-badge {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		font-size: var(--font-size-sm);
	}

	.person-rank {
		font-weight: 600;
		color: var(--color-text-muted);
	}

	.person-name {
		font-weight: 500;
	}

	.stats-summary {
		display: flex;
		justify-content: center;
		gap: var(--spacing-sm);
		padding: var(--spacing-sm) var(--spacing-md);
		background: var(--color-bg);
		border-bottom: 1px solid var(--color-border);
	}

	.stat {
		text-align: center;
		padding: var(--spacing-xs) var(--spacing-sm);
		border-radius: var(--radius-sm);
		min-width: 50px;
	}

	.stat.current { background-color: rgba(34, 197, 94, 0.1); border: 1px solid #22c55e; }
	.stat.warning-yellow { background-color: rgba(234, 179, 8, 0.1); border: 1px solid #eab308; }
	.stat.warning-orange { background-color: rgba(249, 115, 22, 0.1); border: 1px solid #f97316; }
	.stat.expired { background-color: rgba(239, 68, 68, 0.1); border: 1px solid #ef4444; }
	.stat.not-done { background-color: rgba(107, 114, 128, 0.1); border: 1px solid #6b7280; }

	.stat-value {
		display: block;
		font-weight: 700;
		font-size: var(--font-size-base);
	}

	.stat-label {
		font-size: 10px;
		color: var(--color-text-muted);
	}

	.bulk-actions {
		display: flex;
		justify-content: flex-end;
		padding: var(--spacing-sm) var(--spacing-md);
		border-bottom: 1px solid var(--color-border);
	}

	.modal-body {
		flex: 1;
		overflow-y: auto;
		padding: var(--spacing-md);
	}

	.training-list {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm);
	}

	.training-item {
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		background: var(--color-surface);
		overflow: hidden;
	}

	.training-item.has-record {
		border-left: 3px solid var(--color-primary);
	}

	.training-item.editing {
		border-color: var(--color-primary);
	}

	.training-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: var(--spacing-sm) var(--spacing-md);
		background: var(--color-bg);
	}

	.training-info {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
	}

	.training-badge {
		padding: var(--spacing-xs) var(--spacing-sm);
		border-radius: var(--radius-sm);
		color: white;
		font-weight: 500;
		font-size: var(--font-size-sm);
	}

	.status-badge {
		padding: 2px var(--spacing-xs);
		border-radius: var(--radius-sm);
		color: white;
		font-size: 11px;
		font-weight: 500;
	}

	.training-actions {
		display: flex;
		gap: var(--spacing-xs);
	}

	.training-details {
		display: flex;
		flex-wrap: wrap;
		gap: var(--spacing-md);
		padding: var(--spacing-sm) var(--spacing-md);
		font-size: var(--font-size-sm);
	}

	.detail-item {
		display: flex;
		gap: var(--spacing-xs);
	}

	.detail-item.notes {
		width: 100%;
	}

	.detail-label {
		color: var(--color-text-muted);
	}

	.detail-value {
		font-weight: 500;
	}

	.edit-form {
		padding: var(--spacing-md);
		background: var(--color-surface);
		border-top: 1px solid var(--color-border);
	}

	.form-row {
		display: flex;
		gap: var(--spacing-md);
		align-items: flex-end;
		margin-bottom: var(--spacing-sm);
	}

	.form-row .form-group {
		margin-bottom: 0;
	}

	.form-group {
		margin-bottom: var(--spacing-sm);
	}

	.form-group:last-of-type {
		margin-bottom: 0;
	}

	.expiration-preview {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-xs);
	}

	.preview-value {
		font-weight: 500;
		color: var(--color-text);
	}

	.edit-actions {
		display: flex;
		justify-content: flex-end;
		gap: var(--spacing-sm);
		margin-top: var(--spacing-md);
	}

	.checkbox-group {
		margin-bottom: var(--spacing-sm);
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

	.modal-footer {
		padding: var(--spacing-md);
		border-top: 1px solid var(--color-border);
		display: flex;
		justify-content: flex-end;
	}

	/* Mobile Responsive */
	@media (max-width: 640px) {
		.person-training-modal {
			width: 100vw;
			max-width: 100vw;
			height: 100vh;
			max-height: 100vh;
			border-radius: 0;
		}

		.stats-summary {
			flex-wrap: wrap;
			gap: var(--spacing-xs);
		}

		.stat {
			min-width: 45px;
			padding: var(--spacing-xs);
		}

		.stat-value {
			font-size: var(--font-size-sm);
		}

		.training-header {
			flex-direction: column;
			align-items: flex-start;
			gap: var(--spacing-sm);
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
			gap: var(--spacing-xs);
		}
	}
</style>
