<script lang="ts">
	import type { Personnel } from '$lib/types';
	import type { TrainingType, PersonnelTraining } from '$features/training/training.types';
	import { TRAINING_STATUS_COLORS } from '$features/training/training.types';
	import { formatDisplayDate } from '$lib/utils/dates';
	import { trainingTypesStore } from '$features/training/stores/trainingTypes.svelte';
	import { personnelTrainingsStore } from '$features/training/stores/personnelTrainings.svelte';
	import { getTrainingStatus } from '$features/training/utils/trainingStatus';
	import { submitDeletionRequest } from '$lib/utils/deletionRequests';
	import TrainingRecordModal from '$features/training/components/TrainingRecordModal.svelte';

	interface Props {
		person: Personnel;
		canEdit: boolean;
		orgId: string;
	}

	let { person, canEdit, orgId }: Props = $props();

	let showTrainingModal = $state(false);
	let editingTrainingType = $state<TrainingType | undefined>(undefined);

	const trainingStatuses = $derived.by(() => {
		return trainingTypesStore.list
			.map((type) => {
				const training = personnelTrainingsStore.getByPersonnelAndType(person.id, type.id);
				const statusInfo = getTrainingStatus(training, type, person);
				return {
					type,
					training,
					statusInfo
				};
			})
			.sort((a, b) => a.type.sortOrder - b.type.sortOrder);
	});

	function openEditTraining(type: TrainingType) {
		editingTrainingType = type;
		showTrainingModal = true;
	}

	function closeTrainingModal() {
		showTrainingModal = false;
		editingTrainingType = undefined;
	}

	async function handleTrainingSave(data: Omit<PersonnelTraining, 'id'>) {
		await personnelTrainingsStore.add(data);
	}

	async function handleTrainingRemove(id: string) {
		const training = personnelTrainingsStore.getById(id);
		const result = await personnelTrainingsStore.remove(id);
		if (result === 'approval_required' && training) {
			const type = trainingTypesStore.list.find((t) => t.id === training.trainingTypeId);
			await submitDeletionRequest(
				orgId,
				'personnel_training',
				id,
				`${type?.name ?? 'Training'} record for ${person.rank} ${person.lastName}`,
				`/org/${orgId}/leaders-book`
			);
		}
	}
</script>

<div class="leader-card">
	<div class="leader-card-header">
		<h3>Training</h3>
		<div class="training-legend">
			<span class="legend-item" style="--color: {TRAINING_STATUS_COLORS['current']}">Current</span>
			<span class="legend-item" style="--color: {TRAINING_STATUS_COLORS['warning-yellow']}"
				>Warning</span
			>
			<span class="legend-item" style="--color: {TRAINING_STATUS_COLORS['expired']}">Expired</span>
			<span class="legend-item" style="--color: {TRAINING_STATUS_COLORS['not-completed']}"
				>Not Done</span
			>
		</div>
	</div>
	<div class="leader-card-body">
		{#if trainingStatuses.length > 0}
			<div class="training-grid">
				{#each trainingStatuses as item (item.type.id)}
					<button
						class="training-card"
						onclick={() => canEdit && openEditTraining(item.type)}
						disabled={!canEdit}
						style="--status-color: {item.statusInfo.color}"
					>
						<div class="training-card-header">
							<span class="training-name">{item.type.name}</span>
							<span
								class="training-status-badge"
								style="background-color: {item.statusInfo.color}"
							>
								{item.statusInfo.label}
							</span>
						</div>
						{#if item.training?.completionDate}
							<div class="training-dates">
								<span class="completion-date">
									Completed: {formatDisplayDate(item.training.completionDate)}
								</span>
								{#if item.training.expirationDate}
									<span class="expiration-date">
										Expires: {formatDisplayDate(item.training.expirationDate)}
									</span>
								{/if}
							</div>
						{:else if item.statusInfo.status !== 'not-required'}
							<div class="training-dates">
								<span class="no-completion">Not completed</span>
							</div>
						{/if}
						{#if item.training?.notes}
							<div class="training-notes">{item.training.notes}</div>
						{/if}
					</button>
				{/each}
			</div>
		{:else}
			<div class="empty-state">
				<p>No training types configured.</p>
				<p>Training types can be set up in the Training section.</p>
			</div>
		{/if}
	</div>
</div>

{#if showTrainingModal && editingTrainingType}
	<TrainingRecordModal
		{person}
		trainingType={editingTrainingType}
		existingTraining={personnelTrainingsStore.getByPersonnelAndType(
			person.id,
			editingTrainingType.id
		)}
		onSave={handleTrainingSave}
		onRemove={handleTrainingRemove}
		onClose={closeTrainingModal}
	/>
{/if}

<style>
	.training-legend {
		display: flex;
		gap: var(--spacing-md);
		font-size: var(--font-size-xs);
	}

	.legend-item {
		display: flex;
		align-items: center;
		gap: var(--spacing-xs);
	}

	.legend-item::before {
		content: '';
		width: 12px;
		height: 12px;
		border-radius: var(--radius-sm);
		background-color: var(--color);
	}

	.training-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
		gap: var(--spacing-md);
	}

	.training-card {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm);
		padding: var(--spacing-md);
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-left: 4px solid var(--status-color);
		border-radius: var(--radius-lg);
		cursor: pointer;
		transition: all 0.15s ease;
		text-align: left;
	}

	.training-card:hover:not(:disabled) {
		border-color: var(--color-primary);
		border-left-color: var(--status-color);
		box-shadow: var(--shadow-2);
	}

	.training-card:disabled {
		cursor: default;
	}

	.training-card-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--spacing-sm);
	}

	.training-name {
		font-weight: 600;
		font-size: var(--font-size-sm);
	}

	.training-status-badge {
		padding: 2px var(--spacing-sm);
		border-radius: var(--radius-sm);
		color: white;
		font-size: var(--font-size-xs);
		font-weight: 500;
		white-space: nowrap;
	}

	.training-dates {
		display: flex;
		flex-direction: column;
		gap: 2px;
		font-size: var(--font-size-sm);
	}

	.completion-date {
		color: var(--color-text-muted);
	}

	.expiration-date {
		color: var(--color-text-muted);
	}

	.no-completion {
		color: var(--color-text-muted);
		font-style: italic;
	}

	.training-notes {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
		overflow: hidden;
		text-overflow: ellipsis;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
	}

	.empty-state {
		text-align: center;
		padding: var(--spacing-xl);
		color: var(--color-text-muted);
	}
</style>
