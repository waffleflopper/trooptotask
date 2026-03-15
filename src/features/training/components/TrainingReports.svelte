<script lang="ts">
	import type { Personnel } from '$lib/types';
	import type { TrainingType, PersonnelTraining, TrainingStatus } from '$features/training/training.types';
	import type { Group } from '$lib/stores/groups.svelte';
	import { getTrainingStatus, type TrainingStatusInfo } from '$features/training/utils/trainingStatus';
	import { TRAINING_STATUS_COLORS } from '$features/training/training.types';
	import Modal from '$lib/components/Modal.svelte';

	interface Props {
		personnel: Personnel[];
		trainingTypes: TrainingType[];
		trainings: PersonnelTraining[];
		groups: Group[];
		onClose: () => void;
	}

	let { personnel, trainingTypes, trainings, groups, onClose }: Props = $props();

	// Report type tabs
	type ReportType = 'personnel' | 'training';
	let activeReport = $state<ReportType>('personnel');

	// Filters
	let selectedGroupId = $state<string>('');
	let selectedMos = $state<string>('');
	let selectedRole = $state<string>('');
	let selectedTrainingTypeId = $state<string>('');
	let selectedStatuses = $state<Set<TrainingStatus>>(new Set(['expired', 'warning-orange', 'warning-yellow', 'not-completed']));

	// Get unique MOS and Roles for filter dropdowns
	const uniqueMos = $derived([...new Set(personnel.map(p => p.mos).filter(Boolean))].sort());
	const uniqueRoles = $derived([...new Set(personnel.map(p => p.clinicRole).filter(Boolean))].sort());

	// Filter personnel based on selections
	const filteredPersonnel = $derived.by(() => {
		return personnel.filter(p => {
			if (selectedGroupId && p.groupId !== selectedGroupId) return false;
			if (selectedMos && p.mos !== selectedMos) return false;
			if (selectedRole && p.clinicRole !== selectedRole) return false;
			return true;
		});
	});

	// Create training map for quick lookup
	const trainingMap = $derived.by(() => {
		const map = new Map<string, PersonnelTraining>();
		for (const t of trainings) {
			map.set(`${t.personnelId}-${t.trainingTypeId}`, t);
		}
		return map;
	});

	// Personnel report data: group training statuses by person
	interface PersonnelReportItem {
		person: Personnel;
		trainings: {
			type: TrainingType;
			training: PersonnelTraining | undefined;
			statusInfo: TrainingStatusInfo;
		}[];
	}

	const personnelReportData = $derived.by(() => {
		const result: PersonnelReportItem[] = [];

		for (const person of filteredPersonnel) {
			const personTrainings: PersonnelReportItem['trainings'] = [];

			for (const type of trainingTypes) {
				const training = trainingMap.get(`${person.id}-${type.id}`);
				const statusInfo = getTrainingStatus(training, type, person);

				// Only include if status is selected and not "not-required"
				if (statusInfo.status !== 'not-required' && selectedStatuses.has(statusInfo.status)) {
					personTrainings.push({ type, training, statusInfo });
				}
			}

			// Only include person if they have at least one training to show
			if (personTrainings.length > 0) {
				// Sort by urgency
				personTrainings.sort((a, b) => {
					const statusOrder: Record<TrainingStatus, number> = {
						expired: 0, 'warning-orange': 1, 'warning-yellow': 2, 'not-completed': 3, current: 4, 'not-required': 5, exempt: 6
					};
					return statusOrder[a.statusInfo.status] - statusOrder[b.statusInfo.status];
				});
				result.push({ person, trainings: personTrainings });
			}
		}

		// Sort by most urgent person first
		result.sort((a, b) => {
			const statusOrder: Record<TrainingStatus, number> = {
				expired: 0, 'warning-orange': 1, 'warning-yellow': 2, 'not-completed': 3, current: 4, 'not-required': 5, exempt: 6
			};
			const aWorst = Math.min(...a.trainings.map(t => statusOrder[t.statusInfo.status]));
			const bWorst = Math.min(...b.trainings.map(t => statusOrder[t.statusInfo.status]));
			return aWorst - bWorst;
		});

		return result;
	});

	// Training report data: filter by specific training type
	interface TrainingReportItem {
		person: Personnel;
		training: PersonnelTraining | undefined;
		statusInfo: TrainingStatusInfo;
	}

	const trainingReportData = $derived.by(() => {
		if (!selectedTrainingTypeId) return [];

		const type = trainingTypes.find(t => t.id === selectedTrainingTypeId);
		if (!type) return [];

		const result: TrainingReportItem[] = [];

		for (const person of filteredPersonnel) {
			const training = trainingMap.get(`${person.id}-${type.id}`);
			const statusInfo = getTrainingStatus(training, type, person);

			if (statusInfo.status !== 'not-required' && selectedStatuses.has(statusInfo.status)) {
				result.push({ person, training, statusInfo });
			}
		}

		// Sort by urgency
		result.sort((a, b) => {
			const statusOrder: Record<TrainingStatus, number> = {
				expired: 0, 'warning-orange': 1, 'warning-yellow': 2, 'not-completed': 3, current: 4, 'not-required': 5, exempt: 6
			};
			const statusDiff = statusOrder[a.statusInfo.status] - statusOrder[b.statusInfo.status];
			if (statusDiff !== 0) return statusDiff;
			const aDays = a.statusInfo.daysUntilExpiration ?? Infinity;
			const bDays = b.statusInfo.daysUntilExpiration ?? Infinity;
			return aDays - bDays;
		});

		return result;
	});

	// Stats for selected filters
	const stats = $derived.by(() => {
		const counts = { current: 0, warningYellow: 0, warningOrange: 0, expired: 0, notCompleted: 0 };

		for (const person of filteredPersonnel) {
			for (const type of trainingTypes) {
				const training = trainingMap.get(`${person.id}-${type.id}`);
				const statusInfo = getTrainingStatus(training, type, person);

				switch (statusInfo.status) {
					case 'current': counts.current++; break;
					case 'warning-yellow': counts.warningYellow++; break;
					case 'warning-orange': counts.warningOrange++; break;
					case 'expired': counts.expired++; break;
					case 'not-completed': counts.notCompleted++; break;
				}
			}
		}
		return counts;
	});

	function toggleStatus(status: TrainingStatus) {
		const newSet = new Set(selectedStatuses);
		if (newSet.has(status)) {
			newSet.delete(status);
		} else {
			newSet.add(status);
		}
		selectedStatuses = newSet;
	}

	function clearFilters() {
		selectedGroupId = '';
		selectedMos = '';
		selectedRole = '';
	}

	// Excel Export Functions
	function escapeCSV(value: string): string {
		if (value.includes(',') || value.includes('"') || value.includes('\n')) {
			return `"${value.replace(/"/g, '""')}"`;
		}
		return value;
	}

	function exportPersonnelReport() {
		const rows: string[][] = [];

		// Header
		rows.push(['Rank', 'Last Name', 'First Name', 'Group', 'MOS', 'Role', 'Training', 'Status', 'Days Until Expiration', 'Completion Date', 'Expiration Date']);

		for (const item of personnelReportData) {
			const person = item.person;
			for (const t of item.trainings) {
				rows.push([
					person.rank,
					person.lastName,
					person.firstName,
					person.groupName || '',
					person.mos || '',
					person.clinicRole || '',
					t.type.name,
					t.statusInfo.label,
					t.statusInfo.daysUntilExpiration?.toString() ?? '',
					t.training?.completionDate ?? '',
					t.training?.expirationDate ?? ''
				]);
			}
		}

		downloadCSV(rows, 'training-report-by-personnel.csv');
	}

	function exportTrainingReport() {
		if (!selectedTrainingTypeId) return;

		const type = trainingTypes.find(t => t.id === selectedTrainingTypeId);
		if (!type) return;

		const rows: string[][] = [];

		// Header
		rows.push(['Rank', 'Last Name', 'First Name', 'Group', 'MOS', 'Role', 'Status', 'Days Until Expiration', 'Completion Date', 'Expiration Date']);

		for (const item of trainingReportData) {
			const person = item.person;
			rows.push([
				person.rank,
				person.lastName,
				person.firstName,
				person.groupName || '',
				person.mos || '',
				person.clinicRole || '',
				item.statusInfo.label,
				item.statusInfo.daysUntilExpiration?.toString() ?? '',
				item.training?.completionDate ?? '',
				item.training?.expirationDate ?? ''
			]);
		}

		const filename = `training-report-${type.name.toLowerCase().replace(/\s+/g, '-')}.csv`;
		downloadCSV(rows, filename);
	}

	function downloadCSV(rows: string[][], filename: string) {
		const csvContent = rows.map(row => row.map(escapeCSV).join(',')).join('\n');
		const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.setAttribute('href', url);
		link.setAttribute('download', filename);
		link.style.visibility = 'hidden';
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
		URL.revokeObjectURL(url);
	}

	function getStatusColor(status: TrainingStatus): string {
		return TRAINING_STATUS_COLORS[status] || '#6b7280';
	}
</script>

<Modal title="Training Reports" {onClose} width="900px" titleId="training-reports-title">
	{#snippet footer()}
		<div class="footer-info">
			{#if activeReport === 'personnel'}
				{personnelReportData.length} personnel
			{:else if selectedTrainingTypeId}
				{trainingReportData.length} personnel
			{/if}
		</div>
		<div class="spacer"></div>
		<div class="footer-actions">
			{#if activeReport === 'personnel' && personnelReportData.length > 0}
				<button class="btn btn-secondary" onclick={exportPersonnelReport}>
					<svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
						<path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clip-rule="evenodd" />
					</svg>
					Export to Excel
				</button>
			{:else if activeReport === 'training' && selectedTrainingTypeId && trainingReportData.length > 0}
				<button class="btn btn-secondary" onclick={exportTrainingReport}>
					<svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
						<path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clip-rule="evenodd" />
					</svg>
					Export to Excel
				</button>
			{/if}
			<button class="btn btn-primary" onclick={onClose}>Close</button>
		</div>
	{/snippet}

		<!-- Report Type Tabs -->
			<div class="report-tabs">
				<button
					class="tab-btn"
					class:active={activeReport === 'personnel'}
					onclick={() => (activeReport = 'personnel')}
				>
					By Personnel
				</button>
				<button
					class="tab-btn"
					class:active={activeReport === 'training'}
					onclick={() => (activeReport = 'training')}
				>
					By Training
				</button>
			</div>

			<!-- Filters Section -->
			<div class="filters-section">
				<div class="filter-row">
					<div class="filter-group">
						<label class="label">Group:</label>
						<select class="select" bind:value={selectedGroupId}>
							<option value="">All Groups</option>
							{#each groups as group (group.id)}
								<option value={group.id}>{group.name}</option>
							{/each}
						</select>
					</div>

					<div class="filter-group">
						<label class="label">MOS:</label>
						<select class="select" bind:value={selectedMos}>
							<option value="">All MOS</option>
							{#each uniqueMos as mos}
								<option value={mos}>{mos}</option>
							{/each}
						</select>
					</div>

					<div class="filter-group">
						<label class="label">Role:</label>
						<select class="select" bind:value={selectedRole}>
							<option value="">All Roles</option>
							{#each uniqueRoles as role}
								<option value={role}>{role}</option>
							{/each}
						</select>
					</div>

					<button class="btn btn-secondary btn-sm clear-btn" onclick={clearFilters}>Clear</button>
				</div>

				{#if activeReport === 'training'}
					<div class="filter-row">
						<div class="filter-group training-select">
							<label class="label">Training Type:</label>
							<select class="select" bind:value={selectedTrainingTypeId}>
								<option value="">Select a training...</option>
								{#each trainingTypes as type (type.id)}
									<option value={type.id}>{type.name}</option>
								{/each}
							</select>
						</div>
					</div>
				{/if}

				<!-- Status Toggles -->
				<div class="status-toggles">
					<span class="toggle-label">Show:</span>
					<button
						class="status-toggle"
						class:active={selectedStatuses.has('expired')}
						style="--toggle-color: {TRAINING_STATUS_COLORS['expired']}"
						onclick={() => toggleStatus('expired')}
					>
						Expired ({stats.expired})
					</button>
					<button
						class="status-toggle"
						class:active={selectedStatuses.has('warning-orange')}
						style="--toggle-color: {TRAINING_STATUS_COLORS['warning-orange']}"
						onclick={() => toggleStatus('warning-orange')}
					>
						Under 30d ({stats.warningOrange})
					</button>
					<button
						class="status-toggle"
						class:active={selectedStatuses.has('warning-yellow')}
						style="--toggle-color: {TRAINING_STATUS_COLORS['warning-yellow']}"
						onclick={() => toggleStatus('warning-yellow')}
					>
						Under 60d ({stats.warningYellow})
					</button>
					<button
						class="status-toggle"
						class:active={selectedStatuses.has('not-completed')}
						style="--toggle-color: {TRAINING_STATUS_COLORS['not-completed']}"
						onclick={() => toggleStatus('not-completed')}
					>
						Not Done ({stats.notCompleted})
					</button>
					<button
						class="status-toggle"
						class:active={selectedStatuses.has('current')}
						style="--toggle-color: {TRAINING_STATUS_COLORS['current']}"
						onclick={() => toggleStatus('current')}
					>
						Current ({stats.current})
					</button>
				</div>
			</div>

			<!-- Report Content -->
			<div class="report-content">
				{#if activeReport === 'personnel'}
					<!-- Personnel Report -->
					{#if personnelReportData.length === 0}
						<p class="empty-message">No personnel match the selected filters.</p>
					{:else}
						<div class="report-list">
							{#each personnelReportData as item (item.person.id)}
								<div class="person-card">
									<div class="person-header">
										<span class="person-rank">{item.person.rank}</span>
										<span class="person-name">{item.person.lastName}, {item.person.firstName}</span>
										{#if item.person.groupName}
											<span class="person-group">{item.person.groupName}</span>
										{/if}
										{#if item.person.mos}
											<span class="person-mos">{item.person.mos}</span>
										{/if}
										{#if item.person.clinicRole}
											<span class="person-role">{item.person.clinicRole}</span>
										{/if}
									</div>
									<div class="training-list">
										{#each item.trainings as t (t.type.id)}
											<div class="training-item">
												<span class="training-name" style="background-color: {t.type.color}">{t.type.name}</span>
												<span class="training-status" style="background-color: {t.statusInfo.color}">{t.statusInfo.label}</span>
												{#if t.statusInfo.daysUntilExpiration !== null}
													<span class="training-days">{t.statusInfo.daysUntilExpiration}d</span>
												{/if}
											</div>
										{/each}
									</div>
								</div>
							{/each}
						</div>
					{/if}
				{:else}
					<!-- Training Report -->
					{#if !selectedTrainingTypeId}
						<p class="empty-message">Select a training type to view the report.</p>
					{:else if trainingReportData.length === 0}
						<p class="empty-message">No personnel match the selected filters for this training.</p>
					{:else}
						<div class="report-table-container">
						<div class="table-responsive">
							<table class="report-table">
								<thead>
									<tr>
										<th>Rank</th>
										<th>Name</th>
										<th>Group</th>
										<th>Status</th>
										<th>Days</th>
										<th>Completed</th>
										<th>Expires</th>
									</tr>
								</thead>
								<tbody>
									{#each trainingReportData as item (item.person.id)}
										<tr>
											<td class="rank-cell">{item.person.rank}</td>
											<td>{item.person.lastName}, {item.person.firstName}</td>
											<td>{item.person.groupName || '-'}</td>
											<td>
												<span class="status-badge" style="background-color: {item.statusInfo.color}">
													{item.statusInfo.label}
												</span>
											</td>
											<td class="days-cell">
												{item.statusInfo.daysUntilExpiration ?? '-'}
											</td>
											<td>{item.training?.completionDate ?? '-'}</td>
											<td>{item.training?.expirationDate ?? '-'}</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
						</div>
					{/if}
				{/if}
			</div>

</Modal>

<style>
	.report-tabs {
		display: flex;
		gap: var(--spacing-xs);
		margin-bottom: var(--spacing-md);
		border-bottom: 2px solid var(--color-border);
		padding-bottom: var(--spacing-xs);
	}

	.tab-btn {
		padding: var(--spacing-sm) var(--spacing-lg);
		background: none;
		border: none;
		font-size: var(--font-size-sm);
		font-weight: 500;
		color: var(--color-text-muted);
		cursor: pointer;
		border-radius: var(--radius-md) var(--radius-md) 0 0;
		transition: all 0.15s ease;
	}

	.tab-btn:hover {
		background: var(--color-bg);
		color: var(--color-text);
	}

	.tab-btn.active {
		background: var(--color-primary);
		color: #0F0F0F;
	}

	.filters-section {
		background: var(--color-bg);
		padding: var(--spacing-md);
		border-radius: var(--radius-md);
		margin-bottom: var(--spacing-md);
	}

	.filter-row {
		display: flex;
		flex-wrap: wrap;
		gap: var(--spacing-md);
		align-items: flex-end;
		margin-bottom: var(--spacing-sm);
	}

	.filter-row:last-child {
		margin-bottom: 0;
	}

	.filter-group {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-xs);
	}

	.filter-group .label {
		font-size: var(--font-size-sm);
		font-weight: 500;
	}

	.filter-group .select {
		min-width: 150px;
	}

	.filter-group.training-select .select {
		min-width: 250px;
	}

	.clear-btn {
		align-self: flex-end;
	}

	.status-toggles {
		display: flex;
		flex-wrap: wrap;
		gap: var(--spacing-sm);
		align-items: center;
		margin-top: var(--spacing-sm);
	}

	.toggle-label {
		font-size: var(--font-size-sm);
		font-weight: 500;
		color: var(--color-text-muted);
	}

	.status-toggle {
		padding: var(--spacing-xs) var(--spacing-sm);
		border: 2px solid var(--toggle-color);
		border-radius: var(--radius-md);
		background: transparent;
		color: var(--color-text);
		font-size: var(--font-size-sm);
		cursor: pointer;
		transition: all 0.15s ease;
		opacity: 0.5;
	}

	.status-toggle:hover {
		opacity: 0.8;
	}

	.status-toggle.active {
		background: var(--toggle-color);
		color: white;
		opacity: 1;
	}

	.report-content {
		flex: 1;
		overflow-y: auto;
		min-height: 300px;
		max-height: 400px;
	}

	.empty-message {
		color: var(--color-text-muted);
		font-style: italic;
		padding: var(--spacing-xl);
		text-align: center;
	}

	/* Personnel Report Styles */
	.report-list {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-md);
	}

	.person-card {
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		overflow: hidden;
	}

	.person-header {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--spacing-sm);
		padding: var(--spacing-sm) var(--spacing-md);
		background: #0F0F0F;
		color: #F0EDE6;
	}

	.person-rank {
		font-weight: 700;
	}

	.person-name {
		font-weight: 600;
	}

	.person-group,
	.person-mos,
	.person-role {
		font-size: var(--font-size-sm);
		opacity: 0.8;
		padding: 2px var(--spacing-sm);
		background: rgba(255, 255, 255, 0.2);
		border-radius: var(--radius-sm);
	}

	.training-list {
		padding: var(--spacing-sm);
		display: flex;
		flex-wrap: wrap;
		gap: var(--spacing-sm);
	}

	.training-item {
		display: flex;
		align-items: center;
		gap: var(--spacing-xs);
		padding: var(--spacing-xs) var(--spacing-sm);
		background: var(--color-bg);
		border-radius: var(--radius-sm);
		font-size: var(--font-size-sm);
	}

	.training-name {
		padding: 2px var(--spacing-sm);
		border-radius: var(--radius-sm);
		color: white;
		font-weight: 500;
	}

	.training-status {
		padding: 2px var(--spacing-sm);
		border-radius: var(--radius-sm);
		color: white;
		font-size: var(--font-size-xs);
	}

	.training-days {
		font-weight: 600;
		color: var(--color-text-muted);
	}

	/* Training Report Table Styles */
	.report-table-container {
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		overflow: hidden;
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

	.report-table tbody tr:hover {
		background: var(--color-bg);
	}

	.rank-cell {
		font-weight: 600;
		color: var(--color-primary);
	}

	.status-badge {
		display: inline-block;
		padding: 2px var(--spacing-sm);
		border-radius: var(--radius-sm);
		color: white;
		font-weight: 500;
		font-size: var(--font-size-xs);
	}

	.days-cell {
		text-align: center;
		font-weight: 500;
	}

	.footer-info {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
	}

	.footer-actions {
		display: flex;
		gap: var(--spacing-sm);
	}

	.footer-actions .btn {
		display: flex;
		align-items: center;
		gap: var(--spacing-xs);
	}

	/* Mobile Responsive Styles */
	@media (max-width: 640px) {
		.filter-row {
			flex-direction: column;
			align-items: stretch;
		}

		.filter-group .select {
			min-width: unset;
			width: 100%;
		}

		.filter-group.training-select .select {
			min-width: unset;
		}

		.status-toggles {
			flex-wrap: wrap;
		}

		.status-toggle {
			font-size: var(--font-size-xs);
			padding: var(--spacing-xs);
		}

		.person-header {
			flex-direction: column;
			align-items: flex-start;
		}

		.report-table {
			font-size: var(--font-size-xs);
		}

		.footer-actions {
			width: 100%;
			justify-content: flex-end;
		}
	}
</style>
