<script lang="ts">
	import type { Personnel } from '$lib/types';
	import type { CounselingRecord } from '../../counseling.types';
	import { COUNSELING_STATUS_LABELS, COUNSELING_STATUS_COLORS } from '../../counseling.types';
	import { formatDisplayDate } from '$lib/utils/dates';
	import { counselingTypesStore } from '$features/counseling/stores/counselingTypes.svelte';
	import { counselingRecordsStore } from '$features/counseling/stores/counselingRecords.svelte';
	import CounselingRecordModal from '../CounselingRecordModal.svelte';

	interface Props {
		person: Personnel;
		canEdit: boolean;
	}

	let { person, canEdit }: Props = $props();

	let showCounselingModal = $state(false);
	let editingCounseling = $state<CounselingRecord | undefined>(undefined);

	const counselingRecords = $derived(
		counselingRecordsStore
			.getByPersonnelId(person.id)
			.sort(
				(a, b) =>
					new Date(b.dateConducted).getTime() - new Date(a.dateConducted).getTime()
			)
	);

	function getCounselingTypeName(typeId: string | null): string {
		if (!typeId) return 'Freeform';
		const type = counselingTypesStore.getById(typeId);
		return type?.name ?? 'Unknown';
	}

	function getCounselingTypeColor(typeId: string | null): string {
		if (!typeId) return '#6b7280';
		const type = counselingTypesStore.getById(typeId);
		return type?.color ?? '#6b7280';
	}

	function openNewCounseling() {
		editingCounseling = undefined;
		showCounselingModal = true;
	}

	function openEditCounseling(record: CounselingRecord) {
		editingCounseling = record;
		showCounselingModal = true;
	}

	function closeCounselingModal() {
		showCounselingModal = false;
		editingCounseling = undefined;
	}
</script>

<div class="leader-card">
	<div class="leader-card-header">
		<h3>Counselings ({counselingRecords.length})</h3>
		{#if canEdit}
			<button class="btn btn-sm btn-primary" onclick={openNewCounseling}>+ New</button>
		{/if}
	</div>
	<div class="leader-card-body">
		{#if counselingRecords.length > 0}
			<div class="records-list">
				{#each counselingRecords as record (record.id)}
					<button
						class="record-card"
						onclick={() => canEdit && openEditCounseling(record)}
						disabled={!canEdit}
					>
						<div class="record-header">
							<span
								class="record-type"
								style="background-color: {getCounselingTypeColor(record.counselingTypeId)}"
							>
								{getCounselingTypeName(record.counselingTypeId)}
							</span>
							<span class="record-date"
								>{formatDisplayDate(record.dateConducted)}</span
							>
							<span
								class="record-status"
								style="background-color: {COUNSELING_STATUS_COLORS[record.status]}"
							>
								{COUNSELING_STATUS_LABELS[record.status]}
							</span>
						</div>
						<h4 class="record-subject">{record.subject}</h4>
						{#if record.filePath}
							<p class="record-preview file-indicator">PDF attached</p>
						{/if}
						{#if record.notes}
							<p class="record-preview">{record.notes.slice(0, 100)}</p>
						{/if}
						<div class="record-footer">
							{#if record.followUpDate}
								<span class="follow-up"
									>Follow-up: {formatDisplayDate(record.followUpDate)}</span
								>
							{/if}
							<span class="signatures">
								{#if record.counselorSigned}
									<span class="signed">Counselor</span>
								{/if}
								{#if record.soldierSigned}
									<span class="signed">Soldier</span>
								{/if}
							</span>
						</div>
					</button>
				{/each}
			</div>
		{:else}
			<div class="empty-state">
				<p>No counseling records yet.</p>
				{#if canEdit}
					<p>Click "+ New" to add the first counseling record.</p>
				{/if}
			</div>
		{/if}
	</div>
</div>

{#if showCounselingModal}
	<CounselingRecordModal
		{person}
		existingRecord={editingCounseling}
		onClose={closeCounselingModal}
	/>
{/if}

<style>
	.records-list {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-md);
	}

	.record-card {
		display: flex;
		flex-direction: column;
		padding: var(--spacing-md);
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		cursor: pointer;
		transition: all 0.15s ease;
		text-align: left;
	}

	.record-card:hover:not(:disabled) {
		border-color: var(--color-primary);
		box-shadow: var(--shadow-2);
	}

	.record-card:disabled {
		cursor: default;
	}

	.record-header {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		margin-bottom: var(--spacing-sm);
	}

	.record-type {
		padding: 2px var(--spacing-sm);
		border-radius: var(--radius-sm);
		color: white;
		font-size: var(--font-size-xs);
		font-weight: 500;
	}

	.record-date {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
	}

	.record-status {
		padding: 2px var(--spacing-sm);
		border-radius: var(--radius-sm);
		color: white;
		font-size: var(--font-size-xs);
		font-weight: 500;
		margin-left: auto;
	}

	.record-subject {
		font-size: var(--font-size-base);
		font-weight: 600;
		margin: 0 0 var(--spacing-xs);
	}

	.record-preview {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
		margin: 0 0 var(--spacing-sm);
		overflow: hidden;
		text-overflow: ellipsis;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
	}

	.file-indicator {
		color: var(--color-primary);
		font-weight: 500;
	}

	.record-footer {
		display: flex;
		align-items: center;
		gap: var(--spacing-md);
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
	}

	.follow-up {
		color: var(--color-warning);
	}

	.signatures {
		display: flex;
		gap: var(--spacing-sm);
		margin-left: auto;
	}

	.signed {
		padding: 2px var(--spacing-xs);
		background: rgba(34, 197, 94, 0.1);
		border: 1px solid #22c55e;
		border-radius: var(--radius-sm);
		color: #22c55e;
		font-size: var(--font-size-xs);
	}

	.empty-state {
		text-align: center;
		padding: var(--spacing-xl);
		color: var(--color-text-muted);
	}
</style>
