<script lang="ts">
	import type { Personnel } from '$lib/types';
	import type { CounselingRecord, CounselingType, CounselingStatus } from '$lib/types/leadersBook';
	import { COUNSELING_STATUS_LABELS, COUNSELING_STATUS_COLORS } from '$lib/types/leadersBook';
	import { counselingTypesStore } from '$lib/stores/counselingTypes.svelte';
	import { counselingRecordsStore } from '$lib/stores/counselingRecords.svelte';

	interface Props {
		person: Personnel;
		existingRecord?: CounselingRecord;
		onClose: () => void;
	}

	let { person, existingRecord, onClose }: Props = $props();

	const isEdit = !!existingRecord;

	// Form state
	let counselingTypeId = $state(existingRecord?.counselingTypeId ?? '');
	let dateConducted = $state(existingRecord?.dateConducted ?? new Date().toISOString().split('T')[0]);
	let subject = $state(existingRecord?.subject ?? '');
	let keyPoints = $state(existingRecord?.keyPoints ?? '');
	let planOfAction = $state(existingRecord?.planOfAction ?? '');
	let followUpDate = $state(existingRecord?.followUpDate ?? '');
	let status = $state<CounselingStatus>(existingRecord?.status ?? 'draft');
	let counselorSigned = $state(existingRecord?.counselorSigned ?? false);
	let soldierSigned = $state(existingRecord?.soldierSigned ?? false);

	let saving = $state(false);

	const selectedType = $derived(() => {
		if (!counselingTypeId) return null;
		return counselingTypesStore.getById(counselingTypeId) ?? null;
	});

	// When a type is selected, apply its template if it has one
	$effect(() => {
		const type = selectedType();
		if (type && type.templateContent && !isEdit && !keyPoints) {
			keyPoints = type.templateContent;
		}
	});

	const canSave = $derived(subject.trim() && dateConducted);

	async function handleSave() {
		if (!canSave) return;
		saving = true;
		try {
			const data = {
				personnelId: person.id,
				counselingTypeId: counselingTypeId || null,
				dateConducted,
				subject: subject.trim(),
				keyPoints: keyPoints.trim() || null,
				planOfAction: planOfAction.trim() || null,
				followUpDate: followUpDate || null,
				status,
				counselorSigned,
				counselorSignedAt: counselorSigned && !existingRecord?.counselorSigned
					? new Date().toISOString()
					: existingRecord?.counselorSignedAt ?? null,
				soldierSigned,
				soldierSignedAt: soldierSigned && !existingRecord?.soldierSigned
					? new Date().toISOString()
					: existingRecord?.soldierSignedAt ?? null
			};

			if (existingRecord) {
				await counselingRecordsStore.update(existingRecord.id, data);
			} else {
				await counselingRecordsStore.add(data);
			}
			onClose();
		} finally {
			saving = false;
		}
	}

	async function handleRemove() {
		if (existingRecord && confirm('Are you sure you want to delete this counseling record?')) {
			await counselingRecordsStore.remove(existingRecord.id);
			onClose();
		}
	}
</script>

<div
	class="modal-overlay"
	role="dialog"
	aria-modal="true"
	aria-labelledby="counseling-record-title"
	tabindex="-1"
	onkeydown={(e) => e.key === 'Escape' && onClose()}
>
	<button class="modal-backdrop" onclick={onClose} tabindex="-1" aria-label="Close dialog"></button>
	<div class="modal" style="width: 650px; max-height: 90vh;" role="document">
		<div class="modal-header">
			<h2 id="counseling-record-title">{isEdit ? 'Edit' : 'New'} Counseling</h2>
			<button class="btn btn-secondary btn-sm" onclick={onClose}>&times;</button>
		</div>

		<div class="modal-body">
			<div class="person-info">
				<span class="person-rank">{person.rank}</span>
				<span class="person-name">{person.lastName}, {person.firstName}</span>
			</div>

			<div class="form-row">
				<div class="form-group flex-1">
					<label class="label">Counseling Type</label>
					<select class="select" bind:value={counselingTypeId}>
						<option value="">-- Select Type --</option>
						{#each counselingTypesStore.list as type (type.id)}
							<option value={type.id}>{type.name}</option>
						{/each}
					</select>
				</div>
				<div class="form-group">
					<label class="label">Date</label>
					<input type="date" class="input" bind:value={dateConducted} required />
				</div>
			</div>

			<div class="form-group">
				<label class="label">Subject <span class="required">*</span></label>
				<input
					type="text"
					class="input"
					bind:value={subject}
					placeholder="Subject of counseling..."
					required
				/>
			</div>

			<div class="form-group">
				<label class="label">Key Points</label>
				<textarea
					class="input textarea"
					bind:value={keyPoints}
					placeholder="Key discussion points..."
					rows="6"
				></textarea>
				{#if selectedType()?.templateContent && !isEdit}
					<span class="field-hint">Template applied from selected type</span>
				{/if}
			</div>

			<div class="form-group">
				<label class="label">Plan of Action</label>
				<textarea
					class="input textarea"
					bind:value={planOfAction}
					placeholder="Action items and next steps..."
					rows="4"
				></textarea>
			</div>

			<div class="form-row">
				<div class="form-group flex-1">
					<label class="label">Follow-up Date</label>
					<input type="date" class="input" bind:value={followUpDate} />
				</div>
				<div class="form-group flex-1">
					<label class="label">Status</label>
					<select class="select" bind:value={status}>
						{#each Object.entries(COUNSELING_STATUS_LABELS) as [value, label]}
							<option {value}>{label}</option>
						{/each}
					</select>
				</div>
			</div>

			<div class="signatures-section">
				<h3>Signatures</h3>
				<div class="signature-row">
					<label class="signature-checkbox">
						<input type="checkbox" bind:checked={counselorSigned} />
						<span class="signature-label">
							Counselor Signed
							{#if existingRecord?.counselorSignedAt}
								<span class="signature-date">
									({new Date(existingRecord.counselorSignedAt).toLocaleDateString()})
								</span>
							{/if}
						</span>
					</label>
					<label class="signature-checkbox">
						<input type="checkbox" bind:checked={soldierSigned} />
						<span class="signature-label">
							Soldier Signed
							{#if existingRecord?.soldierSignedAt}
								<span class="signature-date">
									({new Date(existingRecord.soldierSignedAt).toLocaleDateString()})
								</span>
							{/if}
						</span>
					</label>
				</div>
			</div>
		</div>

		<div class="modal-footer">
			{#if existingRecord}
				<button class="btn btn-danger" onclick={handleRemove}>Delete</button>
			{/if}
			<div class="spacer"></div>
			<button class="btn btn-secondary" onclick={onClose}>Cancel</button>
			<button class="btn btn-primary" onclick={handleSave} disabled={!canSave || saving}>
				{saving ? 'Saving...' : 'Save'}
			</button>
		</div>
	</div>
</div>

<style>
	.person-info {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		margin-bottom: var(--spacing-lg);
		padding: var(--spacing-sm);
		background: var(--color-bg);
		border-radius: var(--radius-md);
	}

	.person-rank {
		font-weight: 600;
		color: var(--color-primary);
	}

	.person-name {
		font-weight: 500;
	}

	.form-row {
		display: flex;
		gap: var(--spacing-md);
	}

	.form-group {
		margin-bottom: var(--spacing-md);
	}

	.form-group.flex-1 {
		flex: 1;
	}

	.required {
		color: var(--color-error);
	}

	.textarea {
		resize: vertical;
		min-height: 80px;
	}

	.field-hint {
		display: block;
		margin-top: var(--spacing-xs);
		font-size: var(--font-size-xs);
		color: var(--color-text-muted);
	}

	.signatures-section {
		margin-top: var(--spacing-md);
		padding-top: var(--spacing-md);
		border-top: 1px solid var(--color-divider);
	}

	.signatures-section h3 {
		font-size: var(--font-size-sm);
		font-weight: 600;
		color: var(--color-text-muted);
		margin-bottom: var(--spacing-sm);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.signature-row {
		display: flex;
		gap: var(--spacing-lg);
	}

	.signature-checkbox {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		cursor: pointer;
		padding: var(--spacing-sm);
		background: var(--color-bg);
		border-radius: var(--radius-md);
		border: 1px solid var(--color-border);
		flex: 1;
	}

	.signature-checkbox:hover {
		border-color: var(--color-primary);
	}

	.signature-checkbox input[type='checkbox'] {
		width: 18px;
		height: 18px;
		accent-color: var(--color-primary);
		cursor: pointer;
	}

	.signature-label {
		font-weight: 500;
	}

	.signature-date {
		font-size: var(--font-size-xs);
		color: var(--color-text-muted);
		font-weight: 400;
	}

	.modal-footer {
		display: flex;
		gap: var(--spacing-sm);
	}

	.spacer {
		flex: 1;
	}

	.modal-body {
		max-height: 70vh;
		overflow-y: auto;
	}
</style>
