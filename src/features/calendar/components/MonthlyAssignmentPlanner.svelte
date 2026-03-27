<script lang="ts">
	import type { Personnel, AssignmentType, DailyAssignment } from '$lib/types';
	import { formatDate, getMonthDates, getMonthName, isWeekend, addMonths } from '$lib/utils/dates';
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';

	interface GroupData {
		group: string;
		personnel: Personnel[];
	}

	interface Props {
		currentDate: Date;
		assignmentTypes: AssignmentType[];
		assignments: DailyAssignment[];
		personnelByGroup: GroupData[];
		groups: string[];
		onSetAssignment: (date: string, typeId: string, assigneeId: string) => Promise<boolean>;
		onSetAssignmentBatch: (
			assignments: { date: string; assignmentTypeId: string; assigneeId: string }[]
		) => Promise<boolean>;
	}

	let {
		currentDate,
		assignmentTypes,
		assignments,
		personnelByGroup,
		groups,
		onSetAssignment,
		onSetAssignmentBatch
	}: Props = $props();

	// State for selected month
	let viewDate = $state(new Date());

	// Reset view when currentDate prop changes
	$effect(() => {
		viewDate = new Date(currentDate);
	});

	const year = $derived(viewDate.getFullYear());
	const month = $derived(viewDate.getMonth());
	const monthName = $derived(getMonthName(month));
	const dates = $derived(getMonthDates(year, month));

	const allPersonnel = $derived(personnelByGroup.flatMap((g) => g.personnel));

	// Get the current assignment for a date and type
	function getAssignment(date: Date, typeId: string): DailyAssignment | undefined {
		const dateStr = formatDate(date);
		return assignments.find((a) => a.date === dateStr && a.assignmentTypeId === typeId);
	}

	function getAssigneeDisplay(assignment: DailyAssignment | undefined, type: AssignmentType): string {
		if (!assignment) return '';
		if (type.assignTo === 'personnel') {
			const person = allPersonnel.find((p) => p.id === assignment.assigneeId);
			return person ? `${person.rank} ${person.lastName}` : '';
		}
		return assignment.assigneeId;
	}

	async function handleChange(date: Date, typeId: string, value: string) {
		const dateStr = formatDate(date);
		await onSetAssignment(dateStr, typeId, value);
	}

	function prevMonth() {
		viewDate = addMonths(viewDate, -1);
	}

	function nextMonth() {
		viewDate = addMonths(viewDate, 1);
	}

	function goToCurrentMonth() {
		viewDate = new Date();
	}

	// Quick fill functions
	let quickFillType = $state('');
	let quickFillPerson = $state('');
	let quickFillGroup = $state('');
	let quickFillDays = $state<'weekdays' | 'weekends' | 'all'>('weekdays');
	let isApplying = $state(false);

	async function applyQuickFill() {
		if (!quickFillType) return;

		const type = assignmentTypes.find((t) => t.id === quickFillType);
		if (!type) return;

		const assigneeId = type.assignTo === 'personnel' ? quickFillPerson : quickFillGroup;
		if (!assigneeId) return;

		isApplying = true;
		try {
			const batch = dates
				.filter((date) => {
					const weekend = isWeekend(date);
					return (
						quickFillDays === 'all' ||
						(quickFillDays === 'weekdays' && !weekend) ||
						(quickFillDays === 'weekends' && weekend)
					);
				})
				.map((date) => ({
					date: formatDate(date),
					assignmentTypeId: quickFillType,
					assigneeId
				}));
			await onSetAssignmentBatch(batch);
		} finally {
			isApplying = false;
		}
	}

	let clearTypeId = $state<string | null>(null);

	function clearAll(typeId: string) {
		clearTypeId = typeId;
	}

	async function doClearAll() {
		const typeId = clearTypeId;
		if (!typeId) return;
		clearTypeId = null;

		isApplying = true;
		try {
			const batch = dates.map((date) => ({
				date: formatDate(date),
				assignmentTypeId: typeId,
				assigneeId: ''
			}));
			await onSetAssignmentBatch(batch);
		} finally {
			isApplying = false;
		}
	}

	const selectedType = $derived(assignmentTypes.find((t) => t.id === quickFillType));
</script>

<div class="planner-shell">
	<!-- Month Navigation -->
	<div class="month-nav">
		<div class="month-controls">
			<button class="btn btn-secondary btn-sm" onclick={prevMonth} aria-label="Previous month">
				<svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
					<path
						fill-rule="evenodd"
						d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z"
						clip-rule="evenodd"
					/>
				</svg>
			</button>
			<button class="btn btn-secondary btn-sm" onclick={goToCurrentMonth}>Today</button>
		</div>

		<h3>{monthName} {year}</h3>

		<div class="month-controls month-controls-end">
			<button class="btn btn-secondary btn-sm" onclick={nextMonth} aria-label="Next month">
				<svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
					<path
						fill-rule="evenodd"
						d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
						clip-rule="evenodd"
					/>
				</svg>
			</button>
		</div>
	</div>

	<!-- Quick Fill Section -->
	<div class="quick-fill">
		<h4>Quick Fill</h4>
		<div class="quick-fill-row">
			<select class="select" aria-label="Select assignment type" bind:value={quickFillType}>
				<option value="">Select assignment type...</option>
				{#each assignmentTypes as type}
					<option value={type.id}>{type.shortName} - {type.name}</option>
				{/each}
			</select>

			{#if selectedType?.assignTo === 'personnel'}
				<select class="select" bind:value={quickFillPerson}>
					<option value="">Select person...</option>
					{#each personnelByGroup as grp}
						{#if grp.personnel.length > 0}
							<optgroup label={grp.group}>
								{#each grp.personnel as person}
									<option value={person.id}>{person.rank} {person.lastName}</option>
								{/each}
							</optgroup>
						{/if}
					{/each}
				</select>
			{:else if selectedType?.assignTo === 'group'}
				<select class="select" bind:value={quickFillGroup}>
					<option value="">Select group...</option>
					{#each groups as group}
						<option value={group}>{group}</option>
					{/each}
				</select>
			{/if}

			<select class="select days-select" bind:value={quickFillDays}>
				<option value="weekdays">Weekdays only</option>
				<option value="weekends">Weekends only</option>
				<option value="all">All days</option>
			</select>

			<button
				class="btn btn-primary btn-sm"
				onclick={applyQuickFill}
				disabled={!quickFillType || (!quickFillPerson && !quickFillGroup) || isApplying}
			>
				{isApplying ? 'Applying...' : 'Apply'}
			</button>
		</div>
	</div>

	<!-- Assignment Grid -->
	<div class="grid-container">
		<table class="assignment-grid">
			<thead>
				<tr>
					<th class="date-col">Date</th>
					<th class="day-col">Day</th>
					{#each assignmentTypes as type}
						<th class="type-col">
							<div class="type-header">
								<span class="type-badge" style="background-color: {type.color}">{type.shortName}</span>
								<button class="clear-btn" onclick={() => clearAll(type.id)} title="Clear all {type.name}">
									<svg viewBox="0 0 20 20" fill="currentColor" width="12" height="12">
										<path
											fill-rule="evenodd"
											d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9z"
											clip-rule="evenodd"
										/>
									</svg>
								</button>
							</div>
						</th>
					{/each}
				</tr>
			</thead>
			<tbody>
				{#each dates as date}
					{@const dateStr = formatDate(date)}
					{@const weekend = isWeekend(date)}
					{@const dayName = date.toLocaleDateString('en-US', { weekday: 'short' })}
					{@const isToday = formatDate(new Date()) === dateStr}
					<tr class:weekend class:today={isToday}>
						<td class="date-col">
							<span class="date-num">{date.getDate()}</span>
						</td>
						<td class="day-col">
							<span class="day-name">{dayName}</span>
						</td>
						{#each assignmentTypes as type}
							{@const assignment = getAssignment(date, type.id)}
							<td class="assignment-cell">
								{#if type.assignTo === 'personnel'}
									<select
										class="cell-select"
										value={assignment?.assigneeId ?? ''}
										onchange={(e) => handleChange(date, type.id, e.currentTarget.value)}
									>
										<option value="">-</option>
										{#each personnelByGroup as grp}
											{#if grp.personnel.length > 0}
												<optgroup label={grp.group}>
													{#each grp.personnel as person}
														<option value={person.id}>{person.rank} {person.lastName}</option>
													{/each}
												</optgroup>
											{/if}
										{/each}
									</select>
								{:else}
									<select
										class="cell-select"
										value={assignment?.assigneeId ?? ''}
										onchange={(e) => handleChange(date, type.id, e.currentTarget.value)}
									>
										<option value="">-</option>
										{#each groups as group}
											<option value={group}>{group}</option>
										{/each}
									</select>
								{/if}
							</td>
						{/each}
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	<div class="planner-footer">{dates.length} days in {monthName}</div>
</div>

{#if clearTypeId}
	<ConfirmDialog
		title="Clear Assignments"
		message="Clear all assignments for this type for the entire month?"
		confirmLabel="Clear All"
		variant="warning"
		onConfirm={doClearAll}
		onCancel={() => (clearTypeId = null)}
	/>
{/if}

<style>
	.planner-shell {
		background: color-mix(in srgb, var(--color-surface) 88%, white 12%);
		border: 1px solid color-mix(in srgb, var(--color-border) 75%, white 25%);
		border-radius: var(--radius-xl);
		overflow: hidden;
		box-shadow: var(--shadow-sm);
	}

	/* Month Navigation */
	.month-nav {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--spacing-sm);
		padding: var(--spacing-md) var(--spacing-lg);
		background: linear-gradient(180deg, color-mix(in srgb, var(--color-primary) 9%, white 91%), var(--color-surface));
		color: var(--color-text);
		border-bottom: 1px solid var(--color-divider);
	}

	.month-nav h3 {
		font-size: var(--font-size-lg);
		font-weight: 600;
		min-width: 180px;
		text-align: center;
		margin: 0;
		font-family: var(--font-display);
	}

	.month-nav .btn-secondary {
		background: var(--color-surface);
		border-color: var(--color-border);
		color: var(--color-text);
	}

	.month-nav .btn-secondary:hover {
		background: color-mix(in srgb, var(--color-primary) 8%, var(--color-surface));
		border-color: color-mix(in srgb, var(--color-primary) 30%, var(--color-border));
	}

	.month-controls {
		display: inline-flex;
		align-items: center;
		gap: var(--spacing-sm);
		flex-wrap: wrap;
	}

	.month-controls-end {
		justify-content: flex-end;
	}

	/* Quick Fill */
	.quick-fill {
		padding: var(--spacing-md) var(--spacing-lg);
		background: color-mix(in srgb, var(--color-primary) 3%, var(--color-bg));
		border-bottom: 1px solid var(--color-divider);
	}

	.quick-fill h4 {
		font-size: var(--font-size-sm);
		font-weight: 600;
		color: var(--color-text);
		text-transform: uppercase;
		letter-spacing: 0.5px;
		margin-bottom: var(--spacing-sm);
	}

	.quick-fill-row {
		display: flex;
		gap: var(--spacing-sm);
		align-items: center;
		flex-wrap: wrap;
	}

	.quick-fill-row .select {
		flex: 1;
		min-width: 150px;
	}

	.days-select {
		max-width: 140px;
	}

	/* Grid Container */
	.grid-container {
		overflow: auto;
		padding: var(--spacing-md) var(--spacing-lg);
		background: var(--color-surface);
	}

	.assignment-grid {
		width: 100%;
		border-collapse: collapse;
		font-size: var(--font-size-sm);
	}

	.assignment-grid th,
	.assignment-grid td {
		padding: var(--spacing-xs) var(--spacing-sm);
		border: 1px solid var(--color-border);
		text-align: left;
	}

	.assignment-grid th {
		background: color-mix(in srgb, var(--color-primary) 4%, var(--color-surface));
		font-weight: 600;
		position: sticky;
		top: 0;
		z-index: 1;
	}

	.date-col {
		width: 50px;
		text-align: center !important;
	}

	.day-col {
		width: 50px;
	}

	.type-col {
		min-width: 150px;
	}

	.type-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--spacing-xs);
	}

	.type-badge {
		padding: 2px 6px;
		border-radius: var(--radius-sm);
		font-size: 10px;
		font-weight: 700;
		color: white;
	}

	.clear-btn {
		padding: 2px;
		color: var(--color-text-muted);
		border-radius: var(--radius-sm);
		opacity: 0.5;
		transition: opacity 0.15s ease;
	}

	.clear-btn:hover {
		opacity: 1;
		color: #dc2626;
	}

	.date-num {
		font-weight: 600;
		color: var(--color-text);
	}

	.day-name {
		color: var(--color-text);
	}

	.assignment-grid tr.weekend {
		background: var(--color-weekend);
	}

	.assignment-grid tr.weekend .day-name {
		color: var(--color-primary);
		font-weight: 500;
	}

	.assignment-grid tr.today {
		background: var(--color-today-bg);
	}

	.assignment-grid tr.today td {
		border-color: var(--color-today-border);
	}

	.assignment-cell {
		padding: 2px !important;
	}

	.cell-select {
		width: 100%;
		padding: var(--spacing-xs);
		border: 1px solid transparent;
		border-radius: var(--radius-sm);
		background: transparent;
		font-size: var(--font-size-sm);
		cursor: pointer;
		transition: all 0.15s ease;
		color: var(--color-text);
	}

	.cell-select:hover {
		background: var(--color-surface);
		border-color: var(--color-border);
	}

	.cell-select:focus {
		outline: none;
		border-color: var(--color-primary);
		background: var(--color-surface);
	}

	.planner-footer {
		padding: var(--spacing-md) var(--spacing-lg);
		border-top: 1px solid var(--color-divider);
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
		background: color-mix(in srgb, var(--color-primary) 3%, var(--color-surface));
	}

	/* Mobile Responsive Styles */
	@media (max-width: 640px) {
		.month-nav {
			padding: var(--spacing-sm) var(--spacing-md);
			justify-content: center;
		}

		.month-nav h3 {
			font-size: var(--font-size-base);
			min-width: unset;
		}

		.quick-fill {
			padding: var(--spacing-sm) var(--spacing-md);
		}

		.quick-fill-row {
			flex-direction: column;
		}

		.quick-fill-row .select {
			width: 100%;
			min-width: unset;
		}

		.days-select {
			max-width: unset;
		}

		.grid-container {
			padding: var(--spacing-sm);
		}

		.assignment-grid th,
		.assignment-grid td {
			padding: 2px var(--spacing-xs);
		}

		.date-col {
			width: 35px;
		}

		.day-col {
			width: 35px;
		}

		.type-col {
			min-width: 80px;
		}

		.type-header {
			flex-direction: column;
			gap: 2px;
		}

		.type-badge {
			font-size: 8px;
		}

		.cell-select {
			font-size: var(--font-size-xs);
			padding: 2px;
		}
	}

	/* Tablet Responsive Styles */
	@media (min-width: 641px) and (max-width: 1024px) {
		.type-col {
			min-width: 120px;
		}
	}
</style>
