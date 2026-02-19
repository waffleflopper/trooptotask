<script lang="ts">
	import type { Personnel, AvailabilityEntry, StatusType } from '../types';
	import type { AssignmentType, DailyAssignment } from '../stores/dailyAssignments.svelte';
	import { formatDate } from '../utils/dates';

	interface Props {
		assignmentTypes: AssignmentType[];
		assignments: DailyAssignment[];
		personnelByGroup: { group: string; personnel: Personnel[] }[];
		groups: string[];
		availabilityEntries: AvailabilityEntry[];
		statusTypes: StatusType[];
		onApplyRoster: (assignments: { date: string; assignmentTypeId: string; assigneeId: string }[]) => Promise<void>;
		onClose: () => void;
	}

	let {
		assignmentTypes,
		assignments,
		personnelByGroup,
		groups,
		availabilityEntries,
		statusTypes,
		onApplyRoster,
		onClose
	}: Props = $props();

	// Configuration state
	let selectedAssignmentTypeId = $state('');
	let dutyDuration = $state<'daily' | 'weekly' | 'monthly'>('daily');
	let startDate = $state(formatDate(new Date()));
	let endDate = $state('');
	let selectedGroups = $state<string[]>([]);
	let selectedRanks = $state<string[]>([]);
	let selectedMOS = $state<string[]>([]);
	let selectedRoles = $state<string[]>([]);
	let excludeStatuses = $state<string[]>([]);

	// Generated roster state
	let generatedRoster = $state<{ date: string; assignee: Personnel | null; reason?: string }[]>([]);
	let isGenerating = $state(false);
	let isApplying = $state(false);
	let showPreview = $state(false);

	// Extract all unique values in single pass for efficiency (O(n) instead of O(4n))
	const personnelData = $derived(() => {
		const ranks = new Set<string>();
		const mos = new Set<string>();
		const roles = new Set<string>();
		const all: Personnel[] = [];

		for (const group of personnelByGroup) {
			for (const person of group.personnel) {
				all.push(person);
				ranks.add(person.rank);
				if (person.mos) mos.add(person.mos);
				if (person.clinicRole) roles.add(person.clinicRole);
			}
		}

		return {
			allPersonnel: all,
			allRanks: Array.from(ranks).sort(),
			allMOS: Array.from(mos).sort(),
			allRoles: Array.from(roles).sort()
		};
	});

	// Convenience accessors (use function calls for backwards compatibility with template)
	const allPersonnel = $derived(() => personnelData().allPersonnel);
	const allRanks = $derived(() => personnelData().allRanks);
	const allMOS = $derived(() => personnelData().allMOS);
	const allRoles = $derived(() => personnelData().allRoles);

	// Filter personnel based on selection criteria
	const eligiblePersonnel = $derived(() => {
		let personnel = allPersonnel();

		// Filter by groups if any selected
		if (selectedGroups.length > 0) {
			personnel = personnel.filter(p => selectedGroups.includes(p.groupName));
		}

		// Filter by ranks if any selected
		if (selectedRanks.length > 0) {
			personnel = personnel.filter(p => selectedRanks.includes(p.rank));
		}

		// Filter by MOS if any selected
		if (selectedMOS.length > 0) {
			personnel = personnel.filter(p => p.mos && selectedMOS.includes(p.mos));
		}

		// Filter by clinic role if any selected
		if (selectedRoles.length > 0) {
			personnel = personnel.filter(p => p.clinicRole && selectedRoles.includes(p.clinicRole));
		}

		return personnel;
	});

	// Calculate duty counts from existing assignments
	function getDutyCounts(assignmentTypeId: string): Map<string, number> {
		const counts = new Map<string, number>();

		// Initialize all eligible personnel with 0
		eligiblePersonnel().forEach(p => counts.set(p.id, 0));

		// Count existing assignments of this type
		assignments
			.filter(a => a.assignmentTypeId === assignmentTypeId)
			.forEach(a => {
				const current = counts.get(a.assigneeId) ?? 0;
				counts.set(a.assigneeId, current + 1);
			});

		return counts;
	}

	// Check if person is available on a given date
	function isPersonAvailable(person: Personnel, date: string): boolean {
		const entries = availabilityEntries.filter(
			e => e.personnelId === person.id && date >= e.startDate && date <= e.endDate
		);

		if (entries.length === 0) return true; // No status means available

		// Check if any of their statuses are in the exclude list
		for (const entry of entries) {
			if (excludeStatuses.includes(entry.statusTypeId)) {
				return false;
			}
		}

		return true;
	}

	// Get dates based on duration
	function getDutyDates(start: string, end: string, duration: 'daily' | 'weekly' | 'monthly'): string[] {
		const dates: string[] = [];
		const startD = new Date(start + 'T00:00:00');
		const endD = new Date(end + 'T00:00:00');

		let current = new Date(startD);

		while (current <= endD) {
			dates.push(formatDate(current));

			switch (duration) {
				case 'daily':
					current.setDate(current.getDate() + 1);
					break;
				case 'weekly':
					current.setDate(current.getDate() + 7);
					break;
				case 'monthly':
					current.setMonth(current.getMonth() + 1);
					break;
			}
		}

		return dates;
	}

	// DA6-style roster generation algorithm
	function generateRoster() {
		if (!selectedAssignmentTypeId || !startDate || !endDate) return;

		isGenerating = true;

		const dutyDates = getDutyDates(startDate, endDate, dutyDuration);
		const dutyCounts = getDutyCounts(selectedAssignmentTypeId);
		const roster: { date: string; assignee: Personnel | null; reason?: string }[] = [];

		// Working copy of duty counts for this generation
		const workingCounts = new Map(dutyCounts);

		for (const date of dutyDates) {
			// Get available personnel for this date
			const available = eligiblePersonnel().filter(p => isPersonAvailable(p, date));

			if (available.length === 0) {
				roster.push({ date, assignee: null, reason: 'No eligible personnel available' });
				continue;
			}

			// Sort by duty count (lowest first), then by name for consistency
			available.sort((a, b) => {
				const countDiff = (workingCounts.get(a.id) ?? 0) - (workingCounts.get(b.id) ?? 0);
				if (countDiff !== 0) return countDiff;
				return `${a.lastName}${a.firstName}`.localeCompare(`${b.lastName}${b.firstName}`);
			});

			// Assign to person with lowest count
			const assigned = available[0];
			roster.push({ date, assignee: assigned });

			// Increment their working count
			workingCounts.set(assigned.id, (workingCounts.get(assigned.id) ?? 0) + 1);
		}

		generatedRoster = roster;
		showPreview = true;
		isGenerating = false;
	}

	// Apply roster to calendar
	async function applyRoster() {
		if (generatedRoster.length === 0) return;

		isApplying = true;

		const assignmentsToCreate = generatedRoster
			.filter(r => r.assignee !== null)
			.map(r => ({
				date: r.date,
				assignmentTypeId: selectedAssignmentTypeId,
				assigneeId: r.assignee!.id
			}));

		await onApplyRoster(assignmentsToCreate);
		isApplying = false;
		onClose();
	}

	// Export to Excel (HTML table format)
	function exportToExcel() {
		if (generatedRoster.length === 0) return;

		const assignmentType = assignmentTypes.find(t => t.id === selectedAssignmentTypeId);
		const typeName = assignmentType?.name ?? 'Duty';

		let html = `
			<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
			<head>
				<meta charset="utf-8">
				<style>
					table { border-collapse: collapse; }
					th, td { border: 1px solid #000; padding: 8px; text-align: left; }
					th { background-color: #4a5568; color: white; font-weight: bold; }
					.unavailable { background-color: #fed7d7; color: #c53030; }
				</style>
			</head>
			<body>
				<h2>${typeName} Roster</h2>
				<p>Generated: ${new Date().toLocaleDateString()}</p>
				<p>Period: ${formatDisplayDate(startDate)} - ${formatDisplayDate(endDate)}</p>
				<table>
					<tr>
						<th>Date</th>
						<th>Day</th>
						<th>Assigned</th>
						<th>Rank</th>
						<th>Group</th>
						<th>Notes</th>
					</tr>
		`;

		for (const entry of generatedRoster) {
			const date = new Date(entry.date + 'T00:00:00');
			const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
			const displayDate = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

			if (entry.assignee) {
				html += `
					<tr>
						<td>${displayDate}</td>
						<td>${dayName}</td>
						<td>${entry.assignee.lastName}, ${entry.assignee.firstName}</td>
						<td>${entry.assignee.rank}</td>
						<td>${entry.assignee.groupName}</td>
						<td></td>
					</tr>
				`;
			} else {
				html += `
					<tr class="unavailable">
						<td>${displayDate}</td>
						<td>${dayName}</td>
						<td colspan="3">UNFILLED</td>
						<td>${entry.reason ?? ''}</td>
					</tr>
				`;
			}
		}

		html += '</table></body></html>';

		const blob = new Blob([html], { type: 'application/vnd.ms-excel' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `${typeName.replace(/\s+/g, '_')}_Roster_${startDate}_to_${endDate}.xls`;
		a.click();
		URL.revokeObjectURL(url);
	}

	function formatDisplayDate(dateStr: string): string {
		const date = new Date(dateStr + 'T00:00:00');
		return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
	}

	function toggleGroup(group: string) {
		if (selectedGroups.includes(group)) {
			selectedGroups = selectedGroups.filter(g => g !== group);
		} else {
			selectedGroups = [...selectedGroups, group];
		}
	}

	function toggleRank(rank: string) {
		if (selectedRanks.includes(rank)) {
			selectedRanks = selectedRanks.filter(r => r !== rank);
		} else {
			selectedRanks = [...selectedRanks, rank];
		}
	}

	function toggleMOS(mos: string) {
		if (selectedMOS.includes(mos)) {
			selectedMOS = selectedMOS.filter(m => m !== mos);
		} else {
			selectedMOS = [...selectedMOS, mos];
		}
	}

	function toggleRole(role: string) {
		if (selectedRoles.includes(role)) {
			selectedRoles = selectedRoles.filter(r => r !== role);
		} else {
			selectedRoles = [...selectedRoles, role];
		}
	}

	function toggleExcludeStatus(statusId: string) {
		if (excludeStatuses.includes(statusId)) {
			excludeStatuses = excludeStatuses.filter(s => s !== statusId);
		} else {
			excludeStatuses = [...excludeStatuses, statusId];
		}
	}

	// Set default end date when start date changes
	$effect(() => {
		if (startDate && !endDate) {
			const start = new Date(startDate + 'T00:00:00');
			start.setMonth(start.getMonth() + 1);
			endDate = formatDate(start);
		}
	});

	// Set default excluded statuses (common "unavailable" statuses)
	$effect(() => {
		if (excludeStatuses.length === 0 && statusTypes.length > 0) {
			// Auto-select common unavailable status types
			const unavailableNames = ['leave', 'tdy', 'school', 'sick', 'appointment'];
			excludeStatuses = statusTypes
				.filter(s => unavailableNames.some(n => s.name.toLowerCase().includes(n)))
				.map(s => s.id);
		}
	});

	// Personnel-only assignment types
	const personnelAssignmentTypes = $derived(
		assignmentTypes.filter(t => t.assignTo === 'personnel')
	);
</script>

<div class="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="roster-title" tabindex="-1" onkeydown={(e) => e.key === 'Escape' && onClose()}>
	<button class="modal-backdrop" onclick={onClose} tabindex="-1" aria-label="Close dialog"></button>
	<div class="modal roster-modal" role="document">
		<div class="modal-header">
			<h2 id="roster-title">Generate Duty Roster</h2>
			<button class="btn btn-secondary btn-sm close-btn" onclick={onClose} aria-label="Close">&times;</button>
		</div>

		<div class="modal-body">
			{#if !showPreview}
				<!-- Configuration Section -->
				<div class="config-section">
					<h4>Duty Configuration</h4>

					<div class="form-group">
						<label class="label" for="assignmentType">Assignment Type</label>
						<select id="assignmentType" class="select" bind:value={selectedAssignmentTypeId}>
							<option value="">Select duty type...</option>
							{#each personnelAssignmentTypes as type}
								<option value={type.id}>{type.name} ({type.shortName})</option>
							{/each}
						</select>
					</div>

					<div class="form-row">
						<div class="form-group">
							<label class="label" for="duration">Duty Duration</label>
							<select id="duration" class="select" bind:value={dutyDuration}>
								<option value="daily">Daily</option>
								<option value="weekly">Weekly</option>
								<option value="monthly">Monthly</option>
							</select>
						</div>
					</div>

					<div class="form-row">
						<div class="form-group">
							<label class="label" for="startDate">Start Date</label>
							<input id="startDate" type="date" class="input" bind:value={startDate} />
						</div>
						<div class="form-group">
							<label class="label" for="endDate">End Date</label>
							<input id="endDate" type="date" class="input" bind:value={endDate} />
						</div>
					</div>
				</div>

				<div class="config-section">
					<h4>Eligible Personnel</h4>
					<p class="hint">Leave empty to include all. Select specific groups/ranks to filter.</p>

					<div class="filter-group">
						<label class="label">Groups</label>
						<div class="chip-list">
							{#each groups as group}
								<button
									class="chip"
									class:selected={selectedGroups.includes(group)}
									onclick={() => toggleGroup(group)}
								>
									{group || '(No Group)'}
								</button>
							{/each}
						</div>
					</div>

					<div class="filter-group">
						<label class="label">Ranks</label>
						<div class="chip-list">
							{#each allRanks() as rank}
								<button
									class="chip"
									class:selected={selectedRanks.includes(rank)}
									onclick={() => toggleRank(rank)}
								>
									{rank}
								</button>
							{/each}
						</div>
					</div>

					{#if allMOS().length > 0}
						<div class="filter-group">
							<label class="label">MOS</label>
							<div class="chip-list">
								{#each allMOS() as mos}
									<button
										class="chip"
										class:selected={selectedMOS.includes(mos)}
										onclick={() => toggleMOS(mos)}
									>
										{mos}
									</button>
								{/each}
							</div>
						</div>
					{/if}

					{#if allRoles().length > 0}
						<div class="filter-group">
							<label class="label">Roles</label>
							<div class="chip-list">
								{#each allRoles() as role}
									<button
										class="chip"
										class:selected={selectedRoles.includes(role)}
										onclick={() => toggleRole(role)}
									>
										{role}
									</button>
								{/each}
							</div>
						</div>
					{/if}

					<div class="eligible-count">
						{eligiblePersonnel().length} personnel eligible
					</div>
				</div>

				<div class="config-section">
					<h4>Unavailable Statuses</h4>
					<p class="hint">Personnel with these statuses will be skipped.</p>

					<div class="chip-list">
						{#each statusTypes as status}
							<button
								class="chip status-chip"
								class:selected={excludeStatuses.includes(status.id)}
								style="--chip-color: {status.color}; --chip-text: {status.textColor}"
								onclick={() => toggleExcludeStatus(status.id)}
							>
								{status.name}
							</button>
						{/each}
					</div>
				</div>

			{:else}
				<!-- Preview Section -->
				<div class="preview-section">
					<div class="preview-header">
						<h4>Generated Roster Preview</h4>
						<button class="btn btn-secondary btn-sm" onclick={() => (showPreview = false)}>
							&larr; Back to Config
						</button>
					</div>

					<div class="roster-stats">
						<div class="stat">
							<span class="stat-value">{generatedRoster.length}</span>
							<span class="stat-label">Total Duties</span>
						</div>
						<div class="stat">
							<span class="stat-value">{generatedRoster.filter(r => r.assignee).length}</span>
							<span class="stat-label">Filled</span>
						</div>
						<div class="stat unfilled">
							<span class="stat-value">{generatedRoster.filter(r => !r.assignee).length}</span>
							<span class="stat-label">Unfilled</span>
						</div>
					</div>

					<div class="roster-table-container">
						<table class="roster-table">
							<thead>
								<tr>
									<th>Date</th>
									<th>Day</th>
									<th>Assigned</th>
									<th>Group</th>
								</tr>
							</thead>
							<tbody>
								{#each generatedRoster as entry}
									{@const date = new Date(entry.date + 'T00:00:00')}
									<tr class:unfilled={!entry.assignee}>
										<td>{date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</td>
										<td>{date.toLocaleDateString('en-US', { weekday: 'short' })}</td>
										{#if entry.assignee}
											<td>
												<span class="assignee-rank">{entry.assignee.rank}</span>
												{entry.assignee.lastName}, {entry.assignee.firstName}
											</td>
											<td>{entry.assignee.groupName}</td>
										{:else}
											<td class="unfilled-cell" colspan="2">{entry.reason ?? 'Unfilled'}</td>
										{/if}
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				</div>
			{/if}
		</div>

		<div class="modal-footer">
			{#if !showPreview}
				<button class="btn btn-secondary" onclick={onClose}>Cancel</button>
				<button
					class="btn btn-primary"
					onclick={generateRoster}
					disabled={!selectedAssignmentTypeId || !startDate || !endDate || eligiblePersonnel().length === 0 || isGenerating}
				>
					{isGenerating ? 'Generating...' : 'Generate Roster'}
				</button>
			{:else}
				<button class="btn btn-secondary" onclick={exportToExcel}>
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
						<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
						<polyline points="14 2 14 8 20 8" />
						<line x1="16" y1="13" x2="8" y2="13" />
						<line x1="16" y1="17" x2="8" y2="17" />
					</svg>
					Export to Excel
				</button>
				<button
					class="btn btn-primary"
					onclick={applyRoster}
					disabled={isApplying || generatedRoster.filter(r => r.assignee).length === 0}
				>
					{isApplying ? 'Applying...' : 'Apply to Calendar'}
				</button>
			{/if}
		</div>
	</div>
</div>

<style>
	.roster-modal {
		width: 640px;
		max-width: 95vw;
		max-height: 90vh;
		display: flex;
		flex-direction: column;
	}

	.close-btn {
		font-size: 1.25rem;
		line-height: 1;
		padding: var(--spacing-xs) var(--spacing-sm);
	}

	.modal-body {
		flex: 1;
		overflow-y: auto;
	}

	h4 {
		font-size: var(--font-size-sm);
		font-weight: 600;
		color: var(--color-text-muted);
		text-transform: uppercase;
		letter-spacing: 0.5px;
		margin-bottom: var(--spacing-sm);
	}

	.hint {
		font-size: var(--font-size-xs);
		color: var(--color-text-muted);
		margin-bottom: var(--spacing-sm);
	}

	.config-section {
		padding-bottom: var(--spacing-md);
		margin-bottom: var(--spacing-md);
		border-bottom: 1px solid var(--color-border);
	}

	.config-section:last-child {
		border-bottom: none;
		margin-bottom: 0;
	}

	.form-row {
		display: flex;
		gap: var(--spacing-md);
	}

	.form-row .form-group {
		flex: 1;
	}

	.filter-group {
		margin-bottom: var(--spacing-sm);
	}

	.chip-list {
		display: flex;
		flex-wrap: wrap;
		gap: var(--spacing-xs);
	}

	.chip {
		padding: var(--spacing-xs) var(--spacing-sm);
		border-radius: var(--radius-full);
		font-size: var(--font-size-xs);
		border: 1px solid var(--color-border);
		background: var(--color-surface);
		color: var(--color-text);
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.chip:hover {
		border-color: var(--color-primary);
	}

	.chip.selected {
		background: var(--color-primary);
		border-color: var(--color-primary);
		color: white;
	}

	.chip.status-chip.selected {
		background: var(--chip-color);
		border-color: var(--chip-color);
		color: var(--chip-text);
	}

	.eligible-count {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
		padding: var(--spacing-sm);
		background: var(--color-bg);
		border-radius: var(--radius-md);
		text-align: center;
	}

	/* Preview Section */
	.preview-section {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-md);
	}

	.preview-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.preview-header h4 {
		margin-bottom: 0;
	}

	.roster-stats {
		display: flex;
		gap: var(--spacing-md);
	}

	.stat {
		flex: 1;
		text-align: center;
		padding: var(--spacing-sm);
		background: var(--color-bg);
		border-radius: var(--radius-md);
	}

	.stat-value {
		display: block;
		font-size: var(--font-size-xl);
		font-weight: 700;
		color: var(--color-primary);
	}

	.stat-label {
		font-size: var(--font-size-xs);
		color: var(--color-text-muted);
		text-transform: uppercase;
	}

	.stat.unfilled .stat-value {
		color: #dc2626;
	}

	.roster-table-container {
		max-height: 400px;
		overflow-y: auto;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
	}

	.roster-table {
		width: 100%;
		border-collapse: collapse;
		font-size: var(--font-size-sm);
	}

	.roster-table th,
	.roster-table td {
		padding: var(--spacing-sm);
		text-align: left;
		border-bottom: 1px solid var(--color-border);
	}

	.roster-table th {
		background: var(--color-bg);
		font-weight: 600;
		position: sticky;
		top: 0;
	}

	.roster-table tr:last-child td {
		border-bottom: none;
	}

	.roster-table tr.unfilled {
		background: #fef2f2;
	}

	.unfilled-cell {
		color: #dc2626;
		font-style: italic;
	}

	.assignee-rank {
		font-weight: 600;
		color: var(--color-primary);
		margin-right: var(--spacing-xs);
	}

	.modal-footer {
		display: flex;
		justify-content: flex-end;
		gap: var(--spacing-sm);
	}

	.modal-footer .btn svg {
		margin-right: var(--spacing-xs);
	}
</style>
