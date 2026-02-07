<script lang="ts">
	import type { Personnel, TrainingType, PersonnelTraining } from '../types';
	import type { Group } from '../stores/groups.svelte';
	import { getTrainingStats, getDelinquentTrainings, type DelinquentTraining } from '../utils/trainingStatus';
	import { TRAINING_STATUS_COLORS } from '../types';

	interface Props {
		personnel: Personnel[];
		trainingTypes: TrainingType[];
		trainings: PersonnelTraining[];
		groups: Group[];
		onClose: () => void;
	}

	let { personnel, trainingTypes, trainings, groups, onClose }: Props = $props();

	let selectedGroupId = $state<string>('');

	const filteredPersonnel = $derived(
		selectedGroupId ? personnel.filter((p) => p.groupId === selectedGroupId) : personnel
	);

	const stats = $derived(
		getTrainingStats(filteredPersonnel, trainingTypes, trainings)
	);

	const delinquent = $derived(
		getDelinquentTrainings(filteredPersonnel, trainingTypes, trainings, { includeNotCompleted: true })
	);

	function getStatusColor(item: DelinquentTraining): string {
		return item.statusInfo.color;
	}
</script>

<div class="modal-overlay" role="dialog" aria-modal="true" onclick={onClose} onkeydown={(e) => e.key === 'Escape' && onClose()}>
	<div class="modal" style="width: 700px; max-height: 90vh;" onclick={(e) => e.stopPropagation()}>
		<div class="modal-header">
			<h2>Training Reports</h2>
			<button class="btn btn-secondary btn-sm" onclick={onClose}>&times;</button>
		</div>

		<div class="modal-body">
			<div class="filter-row">
				<label class="label">Filter by Group:</label>
				<select class="select" bind:value={selectedGroupId}>
					<option value="">All Groups</option>
					{#each groups as group (group.id)}
						<option value={group.id}>{group.name}</option>
					{/each}
				</select>
			</div>

			<div class="stats-grid">
				<div class="stat-card current">
					<span class="stat-value">{stats.current}</span>
					<span class="stat-label">Current</span>
				</div>
				<div class="stat-card warning-yellow">
					<span class="stat-value">{stats.warningYellow}</span>
					<span class="stat-label">Expiring (60d)</span>
				</div>
				<div class="stat-card warning-orange">
					<span class="stat-value">{stats.warningOrange}</span>
					<span class="stat-label">Expiring (30d)</span>
				</div>
				<div class="stat-card expired">
					<span class="stat-value">{stats.expired}</span>
					<span class="stat-label">Expired</span>
				</div>
				<div class="stat-card not-completed">
					<span class="stat-value">{stats.notCompleted}</span>
					<span class="stat-label">Not Done</span>
				</div>
			</div>

			<div class="delinquent-section">
				<h3>Action Required ({delinquent.length})</h3>
				{#if delinquent.length === 0}
					<p class="empty-message">No delinquent trainings found.</p>
				{:else}
					<div class="delinquent-list">
						<table class="report-table">
							<thead>
								<tr>
									<th>Personnel</th>
									<th>Training</th>
									<th>Status</th>
									<th>Days</th>
								</tr>
							</thead>
							<tbody>
								{#each delinquent as item (item.person.id + '-' + item.type.id)}
									<tr>
										<td>
											<span class="person-rank">{item.person.rank}</span>
											{item.person.lastName}, {item.person.firstName}
											{#if item.person.groupName}
												<span class="person-group">({item.person.groupName})</span>
											{/if}
										</td>
										<td>
											<span class="type-badge" style="background-color: {item.type.color}">
												{item.type.name}
											</span>
										</td>
										<td>
											<span class="status-badge" style="background-color: {getStatusColor(item)}">
												{item.statusInfo.label}
											</span>
										</td>
										<td class="days-cell">
											{#if item.statusInfo.daysUntilExpiration !== null}
												{item.statusInfo.daysUntilExpiration}d
											{:else}
												-
											{/if}
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/if}
			</div>
		</div>

		<div class="modal-footer">
			<button class="btn btn-primary" onclick={onClose}>Close</button>
		</div>
	</div>
</div>

<style>
	.filter-row {
		display: flex;
		align-items: center;
		gap: var(--spacing-md);
		margin-bottom: var(--spacing-lg);
	}

	.filter-row .select {
		width: 200px;
	}

	.stats-grid {
		display: grid;
		grid-template-columns: repeat(5, 1fr);
		gap: var(--spacing-md);
		margin-bottom: var(--spacing-lg);
	}

	.stat-card {
		padding: var(--spacing-md);
		border-radius: var(--radius-md);
		text-align: center;
	}

	.stat-card.current {
		background-color: rgba(34, 197, 94, 0.1);
		border: 1px solid #22c55e;
	}

	.stat-card.warning-yellow {
		background-color: rgba(234, 179, 8, 0.1);
		border: 1px solid #eab308;
	}

	.stat-card.warning-orange {
		background-color: rgba(249, 115, 22, 0.1);
		border: 1px solid #f97316;
	}

	.stat-card.expired {
		background-color: rgba(239, 68, 68, 0.1);
		border: 1px solid #ef4444;
	}

	.stat-card.not-completed {
		background-color: rgba(107, 114, 128, 0.1);
		border: 1px solid #6b7280;
	}

	.stat-value {
		display: block;
		font-size: var(--font-size-xl);
		font-weight: 700;
	}

	.stat-label {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
	}

	.delinquent-section h3 {
		font-size: var(--font-size-base);
		font-weight: 600;
		margin-bottom: var(--spacing-sm);
	}

	.delinquent-list {
		max-height: 400px;
		overflow-y: auto;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
	}

	.report-table {
		width: 100%;
		border-collapse: collapse;
		font-size: var(--font-size-sm);
	}

	.report-table th,
	.report-table td {
		padding: var(--spacing-sm);
		text-align: left;
		border-bottom: 1px solid var(--color-border);
	}

	.report-table th {
		background: var(--color-bg);
		font-weight: 600;
		position: sticky;
		top: 0;
	}

	.person-rank {
		font-weight: 600;
		color: var(--color-text-muted);
		margin-right: var(--spacing-xs);
	}

	.person-group {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
	}

	.type-badge,
	.status-badge {
		display: inline-block;
		padding: 2px var(--spacing-sm);
		border-radius: var(--radius-sm);
		color: white;
		font-weight: 500;
		font-size: var(--font-size-sm);
	}

	.days-cell {
		text-align: center;
		font-weight: 500;
	}

	.empty-message {
		color: var(--color-text-muted);
		font-style: italic;
		padding: var(--spacing-lg);
		text-align: center;
	}
</style>
