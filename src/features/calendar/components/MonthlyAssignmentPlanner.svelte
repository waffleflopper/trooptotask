<script lang="ts">
	import type { Personnel, AssignmentType, DailyAssignment } from '$lib/types';
	import { formatDate, getMonthDates, getMonthName, isWeekend, addMonths } from '$lib/utils/dates';
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
	import SearchSelect from '$lib/components/ui/SearchSelect.svelte';

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

	const assignmentTypeOptions = $derived(
		assignmentTypes.map((type) => ({ value: type.id, label: `${type.shortName} - ${type.name}` }))
	);
	const personnelOptions = $derived(
		personnelByGroup.flatMap((grp) =>
			grp.personnel.map((person) => ({
				value: person.id,
				label: `${person.rank} ${person.lastName}, ${person.firstName}${grp.group ? ` - ${grp.group}` : ''}`
			}))
		)
	);
	const groupOptions = $derived(groups.map((group) => ({ value: group, label: group })));

	// Get the current assignment for a date and type
	function getAssignment(date: Date, typeId: string): DailyAssignment | undefined {
		const dateStr = formatDate(date);
		return assignments.find((a) => a.date === dateStr && a.assignmentTypeId === typeId);
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
	const quickFillAssigneeSelected = $derived(
		selectedType?.assignTo === 'personnel'
			? !!quickFillPerson
			: selectedType?.assignTo === 'group'
				? !!quickFillGroup
				: false
	);
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
			<div class="quick-fill-control">
				<SearchSelect
					options={assignmentTypeOptions}
					bind:value={quickFillType}
					placeholder="Select assignment type..."
					ariaLabel="Select assignment type"
					clearable={false}
				/>
			</div>

			{#if selectedType?.assignTo === 'personnel'}
				<div class="quick-fill-control">
					<SearchSelect
						options={personnelOptions}
						bind:value={quickFillPerson}
						placeholder="Select person..."
						ariaLabel="Select quick-fill person"
					/>
				</div>
			{:else if selectedType?.assignTo === 'group'}
				<div class="quick-fill-control">
					<SearchSelect
						options={groupOptions}
						bind:value={quickFillGroup}
						placeholder="Select group..."
						ariaLabel="Select quick-fill group"
					/>
				</div>
			{/if}

			<select class="select days-select" bind:value={quickFillDays}>
				<option value="weekdays">Weekdays only</option>
				<option value="weekends">Weekends only</option>
				<option value="all">All days</option>
			</select>

			<button
				class="btn btn-primary btn-sm"
				onclick={applyQuickFill}
				disabled={!quickFillType || !quickFillAssigneeSelected || isApplying}
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
									<SearchSelect
										options={personnelOptions}
										value={assignment?.assigneeId ?? ''}
										placeholder="-"
										ariaLabel={`Select ${type.name} assignee for ${dateStr}`}
										compact
										onchange={(value) => handleChange(date, type.id, value)}
									/>
								{:else}
									<SearchSelect
										options={groupOptions}
										value={assignment?.assigneeId ?? ''}
										placeholder="-"
										ariaLabel={`Select ${type.name} group for ${dateStr}`}
										compact
										onchange={(value) => handleChange(date, type.id, value)}
									/>
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
		background: var(--surface-panel);
		border: var(--border-thin);
		border-radius: var(--radius-lg);
		overflow: hidden;
	}

	/* Month Navigation */
	.month-nav {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--sp-3);
		padding: var(--sp-4) var(--sp-5);
		background: color-mix(in srgb, var(--surface-panel) 90%, var(--surface-subtle) 10%);
		color: var(--text-primary);
		border-bottom: var(--border-thin);
	}

	.month-nav h3 {
		font-size: clamp(1.3rem, 1.1rem + 0.5vw, 1.7rem);
		font-weight: var(--font-weight-display);
		min-width: 180px;
		text-align: center;
		margin: 0;
		font-family: var(--font-display);
		letter-spacing: 0.05em;
		text-transform: uppercase;
	}

	.month-nav .btn-secondary {
		background: var(--surface-panel);
		border-color: var(--border-default);
		color: var(--text-primary);
	}

	.month-nav .btn-secondary:hover {
		background: var(--surface-subtle);
		border-color: var(--ink-35);
	}

	.month-controls {
		display: inline-flex;
		align-items: center;
		gap: var(--sp-2);
		flex-wrap: wrap;
	}

	.month-controls-end {
		justify-content: flex-end;
	}

	/* Quick Fill */
	.quick-fill {
		padding: var(--sp-4) var(--sp-5);
		background: color-mix(in srgb, var(--surface-subtle) 72%, var(--surface-panel) 28%);
		border-bottom: var(--border-thin);
	}

	.quick-fill h4 {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		color: var(--text-secondary);
		text-transform: uppercase;
		letter-spacing: var(--letter-spacing-mono);
		margin: 0 0 var(--sp-3);
	}

	.quick-fill-row {
		display: flex;
		gap: var(--sp-2);
		align-items: center;
		flex-wrap: wrap;
	}

	.quick-fill-control {
		flex: 1;
		min-width: 150px;
	}

	.quick-fill-control :global(.search-select) {
		width: 100%;
	}

	.days-select {
		max-width: 140px;
	}

	/* Grid Container */
	.grid-container {
		overflow: auto;
		padding: var(--sp-4) var(--sp-5);
		background: var(--surface-panel);
	}

	.assignment-grid {
		width: 100%;
		border-collapse: collapse;
		font-size: var(--text-sm);
	}

	.assignment-grid th,
	.assignment-grid td {
		padding: var(--sp-2) var(--sp-3);
		border: var(--border-thin);
		text-align: left;
	}

	.assignment-grid th {
		background: color-mix(in srgb, var(--surface-subtle) 86%, var(--surface-panel) 14%);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-secondary);
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
		gap: var(--sp-2);
	}

	.type-badge {
		padding: 2px 6px;
		border-radius: var(--radius-sm);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: white;
	}

	.clear-btn {
		padding: 2px;
		color: var(--text-tertiary);
		border-radius: var(--radius-sm);
		opacity: 0.6;
		transition:
			opacity var(--transition-fast),
			color var(--transition-fast),
			background-color var(--transition-fast);
	}

	.clear-btn:hover {
		opacity: 1;
		color: var(--danger);
		background: var(--danger-bg);
	}

	.date-num {
		font-family: var(--font-display);
		font-size: 1.15rem;
		font-weight: var(--font-weight-display);
		color: var(--text-primary);
	}

	.day-name {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-secondary);
	}

	.assignment-grid tr.weekend {
		background: var(--color-weekend);
	}

	.assignment-grid tr.weekend .day-name {
		color: var(--amber-dark);
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

	.assignment-cell :global(.search-select) {
		width: 100%;
		min-width: 132px;
	}

	.assignment-cell :global(.search-select .input-wrapper) {
		border-color: transparent;
		background: transparent;
		box-shadow: none;
	}

	.assignment-cell :global(.search-select .input-wrapper:hover),
	.assignment-cell :global(.search-select .input-wrapper.open) {
		border-color: var(--border-default);
		background: var(--surface-panel);
	}

	.planner-footer {
		padding: var(--sp-4) var(--sp-5);
		border-top: var(--border-thin);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-secondary);
		background: color-mix(in srgb, var(--surface-subtle) 72%, var(--surface-panel) 28%);
	}

	/* Mobile Responsive Styles */
	@media (max-width: 640px) {
		.month-nav {
			padding: var(--sp-3) var(--sp-4);
			justify-content: center;
		}

		.month-nav h3 {
			font-size: 1.2rem;
			min-width: unset;
		}

		.quick-fill {
			padding: var(--sp-4);
		}

		.quick-fill-row {
			flex-direction: column;
		}

		.quick-fill-control {
			width: 100%;
			min-width: unset;
		}

		.days-select {
			max-width: unset;
		}

		.grid-container {
			padding: var(--sp-3);
		}

		.assignment-grid th,
		.assignment-grid td {
			padding: 2px var(--sp-2);
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
			font-size: 9px;
		}

		.assignment-cell :global(.search-select) {
			min-width: 96px;
		}
	}

	/* Tablet Responsive Styles */
	@media (min-width: 641px) and (max-width: 1024px) {
		.type-col {
			min-width: 120px;
		}
	}
</style>
