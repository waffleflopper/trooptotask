<script lang="ts">
	import type { Personnel } from '$lib/types';
	import type { TrainingType, PersonnelTraining } from '$features/training/training.types';
	import { TRAINING_STATUS_COLORS } from '$features/training/training.types';
	import { formatDisplayDate } from '$lib/utils/dates';
	import GoalsSection from './sections/GoalsSection.svelte';
	import CounselingsSection from './sections/CounselingsSection.svelte';
	import InfoSection from './sections/InfoSection.svelte';
	import StatusSection from './sections/StatusSection.svelte';
	import { trainingTypesStore } from '$features/training/stores/trainingTypes.svelte';
	import { personnelTrainingsStore } from '$features/training/stores/personnelTrainings.svelte';
	import { page } from '$app/stores';
	import { getTrainingStatus } from '$features/training/utils/trainingStatus';
	import { submitDeletionRequest } from '$lib/utils/deletionRequests';
	import TrainingRecordModal from '$features/training/components/TrainingRecordModal.svelte';

	interface Props {
		person: Personnel;
		canEdit: boolean;
		onClose: () => void;
	}

	let { person, canEdit, onClose }: Props = $props();
	const orgId = $page.params.orgId!;

	let showTrainingModal = $state(false);
	let editingTrainingType = $state<TrainingType | undefined>(undefined);

	// Get training statuses for all training types
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

<div
	class="modal-overlay fullscreen"
	role="dialog"
	aria-modal="true"
	aria-labelledby="soldier-view-title"
	tabindex="-1"
	onkeydown={(e) => e.key === 'Escape' && onClose()}
>
	<div class="soldier-view">
		<header class="view-header">
			<div class="header-content">
				<button class="back-btn" onclick={onClose} aria-label="Close">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<line x1="19" y1="12" x2="5" y2="12" />
						<polyline points="12 19 5 12 12 5" />
					</svg>
				</button>
				<div class="person-header-info">
					<h1 id="soldier-view-title">
						<span class="rank">{person.rank}</span>
						{person.lastName}, {person.firstName}
					</h1>
					<div class="person-meta">
						{#if person.groupName}
							<span class="meta-item">{person.groupName}</span>
						{/if}
						{#if person.clinicRole}
							<span class="meta-item">{person.clinicRole}</span>
						{/if}
						{#if person.mos}
							<span class="meta-item">{person.mos}</span>
						{/if}
					</div>
				</div>
			</div>
		</header>

		<main class="view-content">
			<div class="dashboard-row top-row">
				<InfoSection {person} {canEdit} />

				<StatusSection {person} {canEdit} />

				<!-- Training Card -->
				<div class="leader-card">
					<div class="leader-card-header">
						<h3>Training</h3>
						<div class="training-legend">
							<span class="legend-item" style="--color: {TRAINING_STATUS_COLORS['current']}">Current</span>
							<span class="legend-item" style="--color: {TRAINING_STATUS_COLORS['warning-yellow']}">Warning</span>
							<span class="legend-item" style="--color: {TRAINING_STATUS_COLORS['expired']}">Expired</span>
							<span class="legend-item" style="--color: {TRAINING_STATUS_COLORS['not-completed']}">Not Done</span>
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
											<span class="training-status-badge" style="background-color: {item.statusInfo.color}">
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
			</div>

			<div class="dashboard-row bottom-row">
				<CounselingsSection {person} {canEdit} />

				<GoalsSection {person} {canEdit} />
			</div>
		</main>
	</div>
</div>

{#if showTrainingModal && editingTrainingType}
	<TrainingRecordModal
		{person}
		trainingType={editingTrainingType}
		existingTraining={personnelTrainingsStore.getByPersonnelAndType(person.id, editingTrainingType.id)}
		onSave={handleTrainingSave}
		onRemove={handleTrainingRemove}
		onClose={closeTrainingModal}
	/>
{/if}

<style>
	.modal-overlay.fullscreen {
		display: flex;
		align-items: stretch;
		justify-content: stretch;
		top: var(--header-height, 56px);
		z-index: 90;
	}

	.soldier-view {
		width: 100%;
		height: 100%;
		background: var(--color-bg);
		display: flex;
		flex-direction: column;
	}

	.view-header {
		background: #0f0f0f;
		color: #f0ede6;
		padding: var(--spacing-md) var(--spacing-lg);
	}

	.header-content {
		display: flex;
		align-items: center;
		gap: var(--spacing-md);
	}

	.back-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 40px;
		height: 40px;
		border-radius: var(--radius-full);
		background: rgba(255, 255, 255, 0.15);
		color: white;
		transition: all var(--transition-fast);
	}

	.back-btn:hover {
		background: rgba(255, 255, 255, 0.25);
	}

	.back-btn svg {
		width: 24px;
		height: 24px;
	}

	.person-header-info h1 {
		font-size: var(--font-size-xl);
		font-weight: 700;
		margin: 0;
	}

	.person-header-info h1 .rank {
		opacity: 0.9;
	}

	.person-meta {
		display: flex;
		gap: var(--spacing-md);
		margin-top: var(--spacing-xs);
		opacity: 0.9;
	}

	.meta-item {
		font-size: var(--font-size-sm);
	}

	.view-content {
		flex: 1;
		overflow-y: auto;
		padding: var(--spacing-lg);
		display: flex;
		flex-direction: column;
		gap: var(--spacing-lg);
	}

	.dashboard-row {
		display: grid;
		gap: var(--spacing-lg);
	}

	.top-row {
		grid-template-columns: repeat(3, 1fr);
	}

	.bottom-row {
		grid-template-columns: repeat(2, 1fr);
	}

	.empty-state {
		text-align: center;
		padding: var(--spacing-xl);
		color: var(--color-text-muted);
	}

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

	@media (max-width: 1024px) {
		.top-row {
			grid-template-columns: repeat(2, 1fr);
		}
	}

	@media (max-width: 640px) {
		.view-header {
			padding: var(--spacing-sm) var(--spacing-md);
		}

		.person-header-info h1 {
			font-size: var(--font-size-lg);
		}

		.view-content {
			padding: var(--spacing-md);
		}

		.top-row,
		.bottom-row {
			grid-template-columns: 1fr;
		}
	}
</style>
