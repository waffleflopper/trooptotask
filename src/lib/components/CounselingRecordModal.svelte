<script lang="ts">
	import { page } from '$app/stores';
	import type { Personnel } from '$lib/types';
	import type { CounselingRecord, CounselingType, CounselingStatus } from '$lib/types/leadersBook';
	import { COUNSELING_STATUS_LABELS, COUNSELING_STATUS_COLORS } from '$lib/types/leadersBook';
	import { counselingTypesStore } from '$lib/stores/counselingTypes.svelte';
	import { counselingRecordsStore } from '$lib/stores/counselingRecords.svelte';
	import { supabase } from '$lib/supabase';
	import { formatDate } from '$lib/utils/dates';
	import Modal from './Modal.svelte';
	import Spinner from './ui/Spinner.svelte';
	import FileUpload from './ui/FileUpload.svelte';

	interface Props {
		person: Personnel;
		existingRecord?: CounselingRecord;
		onClose: () => void;
	}

	let { person, existingRecord, onClose }: Props = $props();

	const isEdit = !!existingRecord;
	const todayStr = formatDate(new Date());
	const orgId = $page.params.orgId!;
	const uploadId = existingRecord?.id ?? crypto.randomUUID();

	// Form state
	let counselingTypeId = $state(existingRecord?.counselingTypeId ?? '');
	let dateConducted = $state(existingRecord?.dateConducted ?? todayStr);
	let subject = $state(existingRecord?.subject ?? '');
	let notes = $state(existingRecord?.notes ?? '');
	let filePath = $state<string | null>(existingRecord?.filePath ?? null);
	let followUpDate = $state(existingRecord?.followUpDate ?? '');
	let status = $state<CounselingStatus>(existingRecord?.status ?? 'draft');
	let counselorSigned = $state(existingRecord?.counselorSigned ?? false);
	let soldierSigned = $state(existingRecord?.soldierSigned ?? false);

	let saving = $state(false);

	const selectedType = $derived.by(() => {
		if (!counselingTypeId) return null;
		return counselingTypesStore.getById(counselingTypeId) ?? null;
	});

	const hasTemplate = $derived(
		selectedType && (selectedType.templateContent || selectedType.templateFilePath)
	);

	const canSave = $derived(subject.trim() && dateConducted);

	async function handleViewTemplate() {
		if (!selectedType) return;
		if (selectedType.templateFilePath) {
			const { data, error } = await supabase.storage
				.from('counseling-files')
				.createSignedUrl(selectedType.templateFilePath, 60);
			if (data?.signedUrl) {
				window.open(data.signedUrl, '_blank');
			}
		} else if (selectedType.templateContent) {
			// Open template content in a new window as plain text
			const win = window.open('', '_blank');
			if (win) {
				win.document.write(`<pre style="white-space:pre-wrap;font-family:sans-serif;padding:2em;">${selectedType.templateContent}</pre>`);
				win.document.title = `${selectedType.name} Template`;
			}
		}
	}

	async function handleSave() {
		if (!canSave) return;
		saving = true;
		try {
			const data = {
				personnelId: person.id,
				counselingTypeId: counselingTypeId || null,
				dateConducted,
				subject: subject.trim(),
				keyPoints: null,
				planOfAction: null,
				notes: notes.trim() || null,
				filePath,
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
			// Clean up storage file if one exists
			if (existingRecord.filePath) {
				try {
					await supabase.storage.from('counseling-files').remove([existingRecord.filePath]);
				} catch {
					// Best effort
				}
			}
			await counselingRecordsStore.remove(existingRecord.id);
			onClose();
		}
	}
</script>

<Modal
	title="{isEdit ? 'Edit' : 'New'} Counseling"
	{onClose}
	width="650px"
	titleId="counseling-record-title"
>
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
			{#if hasTemplate}
				<button class="template-link" type="button" onclick={handleViewTemplate}>
					View Template
				</button>
			{/if}
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

	<FileUpload
		{filePath}
		{orgId}
		storagePath={uploadId}
		onUpload={(path) => (filePath = path)}
		onRemove={() => (filePath = null)}
		label="Counseling Document (PDF)"
	/>

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

	<div class="form-group">
		<label class="label">Notes (optional)</label>
		<textarea
			class="input textarea"
			bind:value={notes}
			placeholder="Brief notes or comments..."
			rows="3"
		></textarea>
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

	{#snippet footer()}
		{#if existingRecord}
			<button class="btn btn-danger" onclick={handleRemove}>Delete</button>
		{/if}
		<div class="spacer"></div>
		<button class="btn btn-secondary" onclick={onClose}>Cancel</button>
		<button class="btn btn-primary" onclick={handleSave} disabled={!canSave || saving}>
			{#if saving}<Spinner />{/if}
			{saving ? 'Saving...' : 'Save'}
		</button>
	{/snippet}
</Modal>

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

	.template-link {
		display: inline-block;
		margin-top: var(--spacing-xs);
		font-size: var(--font-size-xs);
		color: var(--color-primary);
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
		text-decoration: underline;
	}

	.template-link:hover {
		color: var(--color-primary-dark);
	}

	.textarea {
		resize: vertical;
		min-height: 60px;
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
</style>
