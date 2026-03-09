<script lang="ts">
	import type { Personnel, AvailabilityEntry, TrainingType, PersonnelTraining } from '$lib/types';
	import type { CounselingRecord, DevelopmentGoal } from '$lib/types/leadersBook';
	import {
		COUNSELING_STATUS_LABELS,
		COUNSELING_STATUS_COLORS,
		GOAL_STATUS_LABELS,
		GOAL_STATUS_COLORS,
		GOAL_PRIORITY_LABELS,
		GOAL_PRIORITY_COLORS,
		GOAL_CATEGORY_LABELS,
		GOAL_CATEGORY_COLORS
	} from '$lib/types/leadersBook';
	import { TRAINING_STATUS_COLORS } from '$lib/types';
	import { formatDate as formatDateISO, formatDisplayDate } from '$lib/utils/dates';
	import { personnelExtendedInfoStore } from '$lib/stores/personnelExtendedInfo.svelte';
	import { counselingTypesStore } from '$lib/stores/counselingTypes.svelte';
	import { counselingRecordsStore } from '$lib/stores/counselingRecords.svelte';
	import { developmentGoalsStore } from '$lib/stores/developmentGoals.svelte';
	import { statusTypesStore } from '$lib/stores/statusTypes.svelte';
	import { availabilityStore } from '$lib/stores/availability.svelte';
	import { trainingTypesStore } from '$lib/stores/trainingTypes.svelte';
	import { personnelTrainingsStore } from '$lib/stores/personnelTrainings.svelte';
	import { page } from '$app/stores';
	import { getTrainingStatus } from '$lib/utils/trainingStatus';
	import { submitDeletionRequest } from '$lib/utils/deletionRequests';
	import ExtendedInfoModal from './ExtendedInfoModal.svelte';
	import CounselingRecordModal from './CounselingRecordModal.svelte';
	import DevelopmentGoalModal from './DevelopmentGoalModal.svelte';
	import PersonStatusModal from './PersonStatusModal.svelte';
	import TrainingRecordModal from './TrainingRecordModal.svelte';

	interface Props {
		person: Personnel;
		canEdit: boolean;
		onClose: () => void;
	}

	let { person, canEdit, onClose }: Props = $props();
	const orgId = $page.params.orgId!;

	let showExtendedInfoModal = $state(false);
	let showCounselingModal = $state(false);
	let showGoalModal = $state(false);
	let showStatusModal = $state(false);
	let showTrainingModal = $state(false);
	let editingCounseling = $state<CounselingRecord | undefined>(undefined);
	let editingGoal = $state<DevelopmentGoal | undefined>(undefined);
	let editingStatus = $state<AvailabilityEntry | undefined>(undefined);
	let editingTrainingType = $state<TrainingType | undefined>(undefined);

	const extendedInfo = $derived(personnelExtendedInfoStore.getByPersonnelId(person.id));
	const counselingRecords = $derived(
		counselingRecordsStore.getByPersonnelId(person.id).sort(
			(a, b) => new Date(b.dateConducted).getTime() - new Date(a.dateConducted).getTime()
		)
	);
	const developmentGoals = $derived(developmentGoalsStore.getByPersonnelId(person.id));

	// Get all statuses for this person (reactive via store.list)
	const personStatuses = $derived(
		availabilityStore.list.filter((e) => e.personnelId === person.id)
	);

	// Helper to get local date string (YYYY-MM-DD) without timezone issues
	function getLocalDateStr(date: Date = new Date()): string {
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, '0');
		const day = String(date.getDate()).padStart(2, '0');
		return `${year}-${month}-${day}`;
	}

	// Get current status (active today)
	const currentStatus = $derived.by(() => {
		const todayStr = getLocalDateStr();
		return personStatuses.find((entry) => entry.startDate <= todayStr && entry.endDate >= todayStr);
	});

	// Get upcoming statuses for next 3 months (excluding current)
	const upcomingStatuses = $derived.by(() => {
		const today = new Date();
		const threeMonthsOut = new Date(today);
		threeMonthsOut.setMonth(threeMonthsOut.getMonth() + 3);

		const todayStr = getLocalDateStr(today);
		const futureStr = getLocalDateStr(threeMonthsOut);

		const current = currentStatus;

		return personStatuses
			.filter((entry) => {
				// Exclude the current status from upcoming
				if (current && entry.id === current.id) return false;
				// Include if end date is today or later AND start date is within 3 months
				return entry.endDate >= todayStr && entry.startDate <= futureStr;
			})
			.sort((a, b) => a.startDate.localeCompare(b.startDate));
	});

	// Get training statuses for all training types
	const trainingStatuses = $derived.by(() => {
		return trainingTypesStore.list.map((type) => {
			const training = personnelTrainingsStore.getByPersonnelAndType(person.id, type.id);
			const statusInfo = getTrainingStatus(training, type, person);
			return {
				type,
				training,
				statusInfo
			};
		}).sort((a, b) => a.type.sortOrder - b.type.sortOrder);
	});

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

	function formatAddress(): string {
		if (!extendedInfo) return '';
		const parts = [
			extendedInfo.addressStreet,
			extendedInfo.addressCity,
			extendedInfo.addressState,
			extendedInfo.addressZip
		].filter(Boolean);
		if (parts.length === 0) return '';
		return parts.join(', ');
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

	function openNewGoal() {
		editingGoal = undefined;
		showGoalModal = true;
	}

	function openEditGoal(goal: DevelopmentGoal) {
		editingGoal = goal;
		showGoalModal = true;
	}

	function closeGoalModal() {
		showGoalModal = false;
		editingGoal = undefined;
	}

	function openNewStatus() {
		editingStatus = undefined;
		showStatusModal = true;
	}

	function openEditStatus(entry: AvailabilityEntry) {
		editingStatus = entry;
		showStatusModal = true;
	}

	function closeStatusModal() {
		showStatusModal = false;
		editingStatus = undefined;
	}

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

	function getStatusTypeName(statusTypeId: string): string {
		const type = statusTypesStore.getById(statusTypeId);
		return type?.name ?? 'Unknown';
	}

	function getStatusTypeColor(statusTypeId: string): string {
		const type = statusTypesStore.getById(statusTypeId);
		return type?.color ?? '#6b7280';
	}

	function getStatusTypeTextColor(statusTypeId: string): string {
		const type = statusTypesStore.getById(statusTypeId);
		return type?.textColor ?? '#ffffff';
	}

	function formatDateRange(startDate: string, endDate: string): string {
		const start = new Date(startDate + 'T00:00:00');
		const end = new Date(endDate + 'T00:00:00');
		const startStr = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
		const endStr = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

		if (startDate === endDate) {
			return startStr + ', ' + start.getFullYear();
		}
		return `${startStr} - ${endStr}`;
	}

	function isStatusActive(entry: AvailabilityEntry): boolean {
		const today = formatDateISO(new Date());
		return entry.startDate <= today && entry.endDate >= today;
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
				<!-- Info Card -->
				<div class="card">
					<div class="card-header">
						<h3>Information</h3>
						{#if canEdit}
							<button class="btn btn-sm btn-primary" onclick={() => (showExtendedInfoModal = true)}>
								{extendedInfo ? 'Edit' : '+ Add'}
							</button>
						{/if}
					</div>
					<div class="card-body">
						{#if extendedInfo}
							<div class="info-sections">
								<section class="info-section">
									<h3>Emergency Contact</h3>
									{#if extendedInfo.emergencyContactName}
										<div class="info-row">
											<span class="info-label">Name:</span>
											<span class="info-value">{extendedInfo.emergencyContactName}</span>
										</div>
										{#if extendedInfo.emergencyContactRelationship}
											<div class="info-row">
												<span class="info-label">Relationship:</span>
												<span class="info-value">{extendedInfo.emergencyContactRelationship}</span>
											</div>
										{/if}
										{#if extendedInfo.emergencyContactPhone}
											<div class="info-row">
												<span class="info-label">Phone:</span>
												<span class="info-value">{extendedInfo.emergencyContactPhone}</span>
											</div>
										{/if}
									{:else}
										<p class="no-data">Not provided</p>
									{/if}
								</section>

								<section class="info-section">
									<h3>Spouse</h3>
									{#if extendedInfo.spouseName}
										<div class="info-row">
											<span class="info-label">Name:</span>
											<span class="info-value">{extendedInfo.spouseName}</span>
										</div>
										{#if extendedInfo.spousePhone}
											<div class="info-row">
												<span class="info-label">Phone:</span>
												<span class="info-value">{extendedInfo.spousePhone}</span>
											</div>
										{/if}
									{:else}
										<p class="no-data">Not provided</p>
									{/if}
								</section>

								<section class="info-section">
									<h3>Vehicle</h3>
									{#if extendedInfo.vehicleMakeModel}
										<div class="info-row">
											<span class="info-label">Make/Model:</span>
											<span class="info-value">{extendedInfo.vehicleMakeModel}</span>
										</div>
										{#if extendedInfo.vehicleColor}
											<div class="info-row">
												<span class="info-label">Color:</span>
												<span class="info-value">{extendedInfo.vehicleColor}</span>
											</div>
										{/if}
										{#if extendedInfo.vehiclePlate}
											<div class="info-row">
												<span class="info-label">Plate:</span>
												<span class="info-value">{extendedInfo.vehiclePlate}</span>
											</div>
										{/if}
									{:else}
										<p class="no-data">Not provided</p>
									{/if}
								</section>

								<section class="info-section">
									<h3>Personal Contact</h3>
									{#if extendedInfo.personalEmail || extendedInfo.personalPhone}
										{#if extendedInfo.personalEmail}
											<div class="info-row">
												<span class="info-label">Email:</span>
												<span class="info-value">{extendedInfo.personalEmail}</span>
											</div>
										{/if}
										{#if extendedInfo.personalPhone}
											<div class="info-row">
												<span class="info-label">Phone:</span>
												<span class="info-value">{extendedInfo.personalPhone}</span>
											</div>
										{/if}
									{:else}
										<p class="no-data">Not provided</p>
									{/if}
								</section>

								<section class="info-section">
									<h3>Home Address</h3>
									{#if formatAddress()}
										<p class="address">{formatAddress()}</p>
									{:else}
										<p class="no-data">Not provided</p>
									{/if}
								</section>

								{#if extendedInfo.leaderNotes}
									<section class="info-section full-width">
										<h3>Leader Notes</h3>
										<p class="notes">{extendedInfo.leaderNotes}</p>
									</section>
								{/if}
							</div>
						{:else}
							<div class="empty-state">
								<p>No extended information recorded yet.</p>
								{#if canEdit}
									<p>Click "+ Add" to add emergency contacts, vehicle info, and more.</p>
								{/if}
							</div>
						{/if}
					</div>
				</div>

				<!-- Status Card -->
				<div class="card">
					<div class="card-header">
						<h3>Status</h3>
						{#if canEdit}
							<button class="btn btn-sm btn-primary" onclick={openNewStatus}>+ Add</button>
						{/if}
					</div>
					<div class="card-body">
						<!-- Current Status -->
						<div class="current-status-section">
							<h3>Current Status</h3>
						{#if currentStatus}
								<button
									class="current-status-card"
									onclick={() => canEdit && openEditStatus(currentStatus)}
									disabled={!canEdit}
									style="--status-color: {getStatusTypeColor(currentStatus.statusTypeId)}"
								>
									<span
										class="current-status-badge"
										style="background-color: {getStatusTypeColor(currentStatus.statusTypeId)}; color: {getStatusTypeTextColor(currentStatus.statusTypeId)}"
									>
										{getStatusTypeName(currentStatus.statusTypeId)}
									</span>
									<span class="current-status-dates">
										{formatDateRange(currentStatus.startDate, currentStatus.endDate)}
									</span>
								</button>
							{:else}
								<div class="no-current-status">
									<span>Available / Present for Duty</span>
								</div>
							{/if}
						</div>

						<!-- Upcoming Statuses -->
						<div class="upcoming-statuses-section">
							<div class="statuses-header">
								<h3>Upcoming (Next 3 Months)</h3>
								<span class="status-count">{upcomingStatuses.length} {upcomingStatuses.length === 1 ? 'status' : 'statuses'}</span>
							</div>

							{#if upcomingStatuses.length > 0}
								<div class="statuses-list">
									{#each upcomingStatuses as entry (entry.id)}
										<button
											class="status-card"
											onclick={() => canEdit && openEditStatus(entry)}
											disabled={!canEdit}
										>
											<div class="status-card-header">
												<span
													class="status-type-badge"
													style="background-color: {getStatusTypeColor(entry.statusTypeId)}; color: {getStatusTypeTextColor(entry.statusTypeId)}"
												>
													{getStatusTypeName(entry.statusTypeId)}
												</span>
											</div>
											<div class="status-dates">
												<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
													<rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
													<line x1="16" y1="2" x2="16" y2="6" />
													<line x1="8" y1="2" x2="8" y2="6" />
													<line x1="3" y1="10" x2="21" y2="10" />
												</svg>
												{formatDateRange(entry.startDate, entry.endDate)}
											</div>
										</button>
									{/each}
								</div>
							{:else}
								<div class="empty-state small">
									<p>No upcoming statuses scheduled.</p>
								</div>
							{/if}
						</div>
					</div>
				</div>

				<!-- Training Card -->
				<div class="card">
					<div class="card-header">
						<h3>Training</h3>
						<div class="training-legend">
							<span class="legend-item" style="--color: {TRAINING_STATUS_COLORS['current']}">Current</span>
							<span class="legend-item" style="--color: {TRAINING_STATUS_COLORS['warning-yellow']}">Warning</span>
							<span class="legend-item" style="--color: {TRAINING_STATUS_COLORS['expired']}">Expired</span>
							<span class="legend-item" style="--color: {TRAINING_STATUS_COLORS['not-completed']}">Not Done</span>
						</div>
					</div>
					<div class="card-body">
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
				<!-- Counselings Card -->
				<div class="card">
					<div class="card-header">
						<h3>Counselings ({counselingRecords.length})</h3>
						{#if canEdit}
							<button class="btn btn-sm btn-primary" onclick={openNewCounseling}>+ New</button>
						{/if}
					</div>
					<div class="card-body">
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
											<span class="record-date">{formatDisplayDate(record.dateConducted)}</span>
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
												<span class="follow-up">Follow-up: {formatDisplayDate(record.followUpDate)}</span>
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

				<!-- Goals Card -->
				<div class="card">
					<div class="card-header">
						<h3>Goals ({developmentGoals.length})</h3>
						{#if canEdit}
							<button class="btn btn-sm btn-primary" onclick={openNewGoal}>+ New</button>
						{/if}
					</div>
					<div class="card-body">
						{#if developmentGoals.length > 0}
							<div class="goals-list">
								{#each developmentGoals as goal (goal.id)}
									<button
										class="goal-card"
										onclick={() => canEdit && openEditGoal(goal)}
										disabled={!canEdit}
									>
										<div class="goal-header">
											<span
												class="goal-category"
												style="background-color: {GOAL_CATEGORY_COLORS[goal.category]}"
											>
												{GOAL_CATEGORY_LABELS[goal.category]}
											</span>
											<span
												class="goal-priority"
												style="color: {GOAL_PRIORITY_COLORS[goal.priority]}"
											>
												{GOAL_PRIORITY_LABELS[goal.priority]}
											</span>
										</div>
										<h4 class="goal-title">{goal.title}</h4>
										{#if goal.description}
											<p class="goal-description">{goal.description}</p>
										{/if}
										<div class="goal-footer">
											<span
												class="goal-status"
												style="background-color: {GOAL_STATUS_COLORS[goal.status]}"
											>
												{GOAL_STATUS_LABELS[goal.status]}
											</span>
											{#if goal.targetDate}
												<span class="goal-target">Target: {formatDisplayDate(goal.targetDate)}</span>
											{/if}
										</div>
									</button>
								{/each}
							</div>
						{:else}
							<div class="empty-state">
								<p>No development goals yet.</p>
								{#if canEdit}
									<p>Click "+ New" to add career, education, or personal goals.</p>
								{/if}
							</div>
						{/if}
					</div>
				</div>
			</div>
		</main>
	</div>
</div>

{#if showExtendedInfoModal}
	<ExtendedInfoModal {person} onClose={() => (showExtendedInfoModal = false)} />
{/if}

{#if showCounselingModal}
	<CounselingRecordModal
		{person}
		existingRecord={editingCounseling}
		onClose={closeCounselingModal}
	/>
{/if}

{#if showGoalModal}
	<DevelopmentGoalModal {person} existingGoal={editingGoal} onClose={closeGoalModal} />
{/if}

{#if showStatusModal}
	<PersonStatusModal {person} existingEntry={editingStatus} onClose={closeStatusModal} />
{/if}

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
		background: #0F0F0F;
		color: #F0EDE6;
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

	.card {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		display: flex;
		flex-direction: column;
		min-height: 0;
		max-height: 480px;
	}

	.card-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--spacing-md) var(--spacing-lg);
		border-bottom: 1px solid var(--color-border);
		flex-shrink: 0;
	}

	.card-header h3 {
		font-size: var(--font-size-base);
		font-weight: 600;
		margin: 0;
	}

	.card-body {
		overflow-y: auto;
		padding: var(--spacing-md) var(--spacing-lg);
		flex: 1;
	}

	.btn-sm {
		padding: var(--spacing-xs) var(--spacing-sm);
		font-size: var(--font-size-sm);
	}

	.info-sections {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-md);
	}

	.info-section {
		background: var(--color-surface);
		border-radius: var(--radius-lg);
		padding: var(--spacing-md);
		border: 1px solid var(--color-border);
	}

.info-section h3 {
		font-size: var(--font-size-sm);
		font-weight: 600;
		color: var(--color-text-muted);
		margin-bottom: var(--spacing-sm);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.info-row {
		display: flex;
		gap: var(--spacing-sm);
		margin-bottom: var(--spacing-xs);
	}

	.info-label {
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
		min-width: 100px;
	}

	.info-value {
		font-weight: 500;
	}

	.address {
		margin: 0;
	}

	.notes {
		margin: 0;
		white-space: pre-wrap;
	}

	.no-data {
		color: var(--color-text-muted);
		font-style: italic;
		margin: 0;
	}

	.empty-state {
		text-align: center;
		padding: var(--spacing-xl);
		color: var(--color-text-muted);
	}

	.empty-state.small {
		padding: var(--spacing-lg);
	}

	.empty-state.small p {
		margin: 0;
	}

	.records-list,
	.goals-list {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-md);
	}

	.record-card,
	.goal-card {
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

	.record-card:hover:not(:disabled),
	.goal-card:hover:not(:disabled) {
		border-color: var(--color-primary);
		box-shadow: var(--shadow-2);
	}

	.record-card:disabled,
	.goal-card:disabled {
		cursor: default;
	}

	.record-header,
	.goal-header {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		margin-bottom: var(--spacing-sm);
	}

	.record-type,
	.goal-category {
		padding: 2px var(--spacing-sm);
		border-radius: var(--radius-sm);
		color: white;
		font-size: var(--font-size-xs);
		font-weight: 500;
	}

	.record-date,
	.goal-target {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
	}

	.record-status,
	.goal-status {
		padding: 2px var(--spacing-sm);
		border-radius: var(--radius-sm);
		color: white;
		font-size: var(--font-size-xs);
		font-weight: 500;
		margin-left: auto;
	}

	.goal-priority {
		font-size: var(--font-size-sm);
		font-weight: 600;
	}

	.record-subject,
	.goal-title {
		font-size: var(--font-size-base);
		font-weight: 600;
		margin: 0 0 var(--spacing-xs);
	}

	.record-preview,
	.goal-description {
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

	.record-footer,
	.goal-footer {
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

	/* Statuses Tab Styles */
	.current-status-section {
		margin-bottom: var(--spacing-xl);
	}

	.current-status-section h3 {
		font-size: var(--font-size-sm);
		font-weight: 600;
		color: var(--color-text-muted);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		margin-bottom: var(--spacing-sm);
	}

	.current-status-card {
		display: flex;
		align-items: center;
		gap: var(--spacing-md);
		padding: var(--spacing-md) var(--spacing-lg);
		background: var(--color-surface);
		border: 2px solid var(--status-color);
		border-radius: var(--radius-lg);
		cursor: pointer;
		transition: all 0.15s ease;
		text-align: left;
		width: 100%;
	}

	.current-status-card:hover:not(:disabled) {
		box-shadow: var(--shadow-2);
	}

	.current-status-card:disabled {
		cursor: default;
	}

	.current-status-badge {
		padding: var(--spacing-xs) var(--spacing-md);
		border-radius: var(--radius-md);
		font-weight: 600;
		font-size: var(--font-size-base);
	}

	.current-status-dates {
		font-size: var(--font-size-base);
		color: var(--color-text);
	}

	.no-current-status {
		padding: var(--spacing-md) var(--spacing-lg);
		background: var(--color-bg);
		border: 1px dashed var(--color-border);
		border-radius: var(--radius-lg);
		color: var(--color-text-muted);
		font-style: italic;
	}

	.upcoming-statuses-section {
		border-top: 1px solid var(--color-border);
		padding-top: var(--spacing-lg);
	}

	.statuses-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: var(--spacing-md);
	}

	.statuses-header h3 {
		font-size: var(--font-size-sm);
		font-weight: 600;
		color: var(--color-text-muted);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		margin: 0;
	}

	.status-count {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
	}

	.statuses-list {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm);
	}

	.status-card {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm);
		padding: var(--spacing-md);
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		cursor: pointer;
		transition: all 0.15s ease;
		text-align: left;
	}

	.status-card:hover:not(:disabled) {
		border-color: var(--color-primary);
		box-shadow: var(--shadow-2);
	}

	.status-card:disabled {
		cursor: default;
	}

	.status-card.active {
		border-color: var(--color-primary);
		background: var(--color-primary-bg);
	}

	.status-card-header {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
	}

	.status-type-badge {
		padding: var(--spacing-xs) var(--spacing-sm);
		border-radius: var(--radius-sm);
		font-weight: 500;
		font-size: var(--font-size-sm);
	}

	.active-badge {
		padding: 2px var(--spacing-sm);
		background: var(--color-primary);
		color: #0F0F0F;
		border-radius: var(--radius-sm);
		font-size: var(--font-size-xs);
		font-weight: 500;
	}

	.status-dates {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
	}

	.status-dates svg {
		width: 16px;
		height: 16px;
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

		.card {
			max-height: none;
		}

	}
</style>
