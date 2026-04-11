<script lang="ts">
	import type { Personnel, AvailabilityEntry, StatusType, AssignmentType, DailyAssignment } from '$lib/types';
	import { formatDate } from '$lib/utils/dates';
	import Modal from '$lib/components/Modal.svelte';
	import { SvelteMap } from 'svelte/reactivity';

	interface GroupData {
		group: string;
		personnel: Personnel[];
	}

	interface Props {
		personnelByGroup: GroupData[];
		availabilityEntries: AvailabilityEntry[];
		statusTypes: StatusType[];
		assignmentTypes: AssignmentType[];
		assignments: DailyAssignment[];
		onClose: () => void;
	}

	let { personnelByGroup, availabilityEntries, statusTypes, assignmentTypes, assignments, onClose }: Props = $props();

	let selectedDate = $state(new Date());
	let datePickerEl: HTMLInputElement | undefined = $state();
	const selectedDateStr = $derived(formatDate(selectedDate));

	const isToday = $derived(formatDate(selectedDate) === formatDate(new Date()));

	const dateDisplay = $derived(
		selectedDate.toLocaleDateString('en-US', {
			weekday: 'long',
			month: 'long',
			day: 'numeric',
			year: 'numeric'
		})
	);

	function shiftDate(days: number) {
		selectedDate = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate() + days);
	}

	function handleDateInput(e: Event) {
		const value = (e.target as HTMLInputElement).value;
		if (value) {
			const [y, m, d] = value.split('-').map(Number);
			selectedDate = new Date(y, m - 1, d);
		}
	}

	// Format selectedDate as YYYY-MM-DD for the input
	const inputDateStr = $derived(
		`${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`
	);

	const allPersonnel = $derived(personnelByGroup.flatMap((g) => g.personnel));

	// Get today's assignments
	const todayAssignments = $derived(assignments.filter((a) => a.date === selectedDateStr));

	// Find assignment types and their assigned values
	const assignmentInfo = $derived.by(() => {
		return assignmentTypes.map((type) => {
			const assignment = todayAssignments.find((a) => a.assignmentTypeId === type.id);
			let assigneeName = 'Not Assigned';
			let assigneeDetails = '';

			if (assignment) {
				if (type.assignTo === 'personnel') {
					const person = allPersonnel.find((p) => p.id === assignment.assigneeId);
					if (person) {
						assigneeName = `${person.rank} ${person.lastName}`;
						assigneeDetails = person.clinicRole || '';
					}
				} else {
					// Group assignment - assigneeId is the group name
					assigneeName = assignment.assigneeId || 'Unknown';
				}
			}

			return {
				type,
				assignment,
				assigneeName,
				assigneeDetails,
				isAssigned: !!assignment
			};
		});
	});

	// Get personnel with statuses today
	function getPersonnelStatuses(personnelId: string): { status: StatusType; entry: AvailabilityEntry }[] {
		return availabilityEntries
			.filter((e) => e.personnelId === personnelId && selectedDateStr >= e.startDate && selectedDateStr <= e.endDate)
			.map((e) => {
				const status = statusTypes.find((s) => s.id === e.statusTypeId);
				return status ? { status, entry: e } : null;
			})
			.filter((s): s is { status: StatusType; entry: AvailabilityEntry } => s !== null);
	}

	// Categorize personnel
	const personnelBreakdown = $derived.by(() => {
		const available: { person: Personnel; assignments: string[] }[] = [];
		const unavailable: { person: Personnel; statuses: { status: StatusType; entry: AvailabilityEntry }[] }[] = [];

		// Find who has assignments today
		const personnelAssignments = new SvelteMap<string, string[]>();
		for (const info of assignmentInfo) {
			if (info.assignment && info.type.assignTo === 'personnel') {
				const current = personnelAssignments.get(info.assignment.assigneeId) || [];
				current.push(info.type.shortName);
				personnelAssignments.set(info.assignment.assigneeId, current);
			}
		}

		for (const person of allPersonnel) {
			const statuses = getPersonnelStatuses(person.id);
			const assignments = personnelAssignments.get(person.id) || [];

			if (statuses.length === 0) {
				available.push({ person, assignments });
			} else {
				unavailable.push({ person, statuses });
			}
		}

		return { available, unavailable };
	});

	// Group unavailable personnel by status
	const outByStatus = $derived.by(() => {
		const groups = new SvelteMap<string, { status: StatusType; personnel: Personnel[] }>();

		for (const { person, statuses } of personnelBreakdown.unavailable) {
			for (const { status } of statuses) {
				if (!groups.has(status.id)) {
					groups.set(status.id, { status, personnel: [] });
				}
				groups.get(status.id)!.personnel.push(person);
			}
		}

		return [...groups.values()].sort((a, b) => a.status.name.localeCompare(b.status.name));
	});
</script>

<Modal title={isToday ? "Today's Breakdown" : 'Daily Breakdown'} {onClose} width="700px" titleId="breakdown-title">
	<div class="date-banner">
		<button class="date-nav-btn" onclick={() => shiftDate(-1)} title="Previous day">&lsaquo;</button>
		<button class="date-display-btn" onclick={() => datePickerEl?.showPicker?.()}>
			{dateDisplay}
		</button>
		<input
			bind:this={datePickerEl}
			type="date"
			class="hidden-date-input"
			value={inputDateStr}
			oninput={handleDateInput}
		/>
		<button class="date-nav-btn" onclick={() => shiftDate(1)} title="Next day">&rsaquo;</button>
	</div>

	<!-- Summary Stats -->
	<div class="stats-row">
		<div class="stat">
			<span class="stat-value available">{personnelBreakdown.available.length}</span>
			<span class="stat-label">Available</span>
		</div>
		<div class="stat">
			<span class="stat-value unavailable">{personnelBreakdown.unavailable.length}</span>
			<span class="stat-label">Out</span>
		</div>
		<div class="stat">
			<span class="stat-value total">{allPersonnel.length}</span>
			<span class="stat-label">Total</span>
		</div>
	</div>

	<div class="breakdown-content">
		<!-- Daily Assignments -->
		{#if assignmentInfo.length > 0}
			<section class="section assignments-section">
				<h3>Daily Assignments</h3>
				<div class="assignment-grid">
					{#each assignmentInfo as info (info.type.id)}
						<div class="assignment-card" class:not-assigned={!info.isAssigned}>
							<div class="assignment-type">
								<span class="assignment-short">{info.type.shortName}</span>
								<span class="assignment-name">{info.type.name}</span>
							</div>
							<div class="assignment-value">
								{#if info.isAssigned}
									<span class="assignee-name">{info.assigneeName}</span>
									{#if info.assigneeDetails}
										<span class="assignee-details">{info.assigneeDetails}</span>
									{/if}
								{:else}
									<span class="not-assigned-text">Not Assigned</span>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			</section>
		{/if}

		<!-- Available -->
		<section class="section available-section">
			<h3>
				<span class="section-icon in">&#10003;</span>
				Available
				<span class="count">{personnelBreakdown.available.length}</span>
			</h3>
			{#if personnelBreakdown.available.length === 0}
				<div class="empty-message">No one is available {isToday ? 'today' : 'this day'}</div>
			{:else}
				<div class="personnel-groups">
					{#each personnelByGroup as grp (grp.group)}
						{@const availableForGroup = personnelBreakdown.available.filter((p) => p.person.groupName === grp.group)}
						{#if availableForGroup.length > 0}
							<div class="group-block">
								<div class="group-label">{grp.group}</div>
								<div class="personnel-chips">
									{#each availableForGroup as { person, assignments } (person.id)}
										<div class="person-chip" class:has-assignment={assignments.length > 0}>
											<span class="chip-rank">{person.rank}</span>
											<span class="chip-name">{person.lastName}</span>
											{#if assignments.length > 0}
												{#each assignments as badge (badge)}
													<span class="assignment-badge">{badge}</span>
												{/each}
											{/if}
										</div>
									{/each}
								</div>
							</div>
						{/if}
					{/each}
				</div>
			{/if}
		</section>

		<!-- Unavailable -->
		<section class="section unavailable-section">
			<h3>
				<span class="section-icon out">&#10007;</span>
				Unavailable
				<span class="count">{personnelBreakdown.unavailable.length}</span>
			</h3>
			{#if personnelBreakdown.unavailable.length === 0}
				<div class="empty-message success">Everyone is available{isToday ? ' today' : ''}!</div>
			{:else}
				<div class="status-groups">
					{#each outByStatus as { status, personnel } (status.id)}
						<div class="status-group">
							<div class="status-header" style="background-color: {status.color}; color: {status.textColor}">
								{status.name}
								<span class="status-count">{personnel.length}</span>
							</div>
							<div class="status-personnel">
								{#each personnel as person (person.id)}
									<div class="person-chip out">
										<span class="chip-rank">{person.rank}</span>
										<span class="chip-name">{person.lastName}</span>
									</div>
								{/each}
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</section>
	</div>

	{#snippet footer()}
		<button class="btn btn-primary" onclick={onClose}>Close</button>
	{/snippet}
</Modal>

<style>
	.date-banner {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--sp-2);
		padding: var(--sp-2) var(--sp-6);
		background: var(--amber);
		color: var(--color-chrome);
		/* Bleed past modal-body padding to fill edge-to-edge */
		margin: calc(-1 * var(--sp-4)) calc(-1 * var(--sp-6)) 0;
		position: relative;
	}

	.date-nav-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		border: 1px solid rgba(255, 255, 255, 0.3);
		border-radius: var(--radius-md);
		background: transparent;
		color: var(--color-chrome);
		font-size: 1.25rem;
		cursor: pointer;
		transition: background 0.15s ease;
	}

	.date-nav-btn:hover {
		background: rgba(255, 255, 255, 0.15);
	}

	.date-display-btn {
		background: transparent;
		border: none;
		color: var(--color-chrome);
		font-size: var(--text-base);
		font-weight: 600;
		cursor: pointer;
		padding: var(--sp-1) var(--sp-2);
		border-radius: var(--radius-md);
		transition: background 0.15s ease;
	}

	.date-display-btn:hover {
		background: rgba(255, 255, 255, 0.15);
	}

	.hidden-date-input {
		position: absolute;
		opacity: 0;
		width: 0;
		height: 0;
		pointer-events: none;
	}

	/* Stats Row */
	.stats-row {
		display: flex;
		justify-content: center;
		gap: var(--sp-8);
		padding: var(--sp-4) var(--sp-6);
		background: var(--surface-page);
		border-bottom: 1px solid var(--border-default);
		/* Bleed past modal-body padding to fill edge-to-edge */
		margin: 0 calc(-1 * var(--sp-6));
	}

	.stat {
		display: flex;
		flex-direction: column;
		align-items: center;
	}

	.stat-value {
		font-size: 1.75rem;
		font-weight: 700;
		line-height: 1;
	}

	.stat-value.available {
		color: #22c55e;
	}

	.stat-value.unavailable {
		color: #ef4444;
	}

	.stat-value.total {
		color: var(--amber);
	}

	.stat-label {
		font-size: var(--text-ui-sm);
		color: var(--text-tertiary);
		margin-top: var(--sp-1);
	}

	/* Content */
	.breakdown-content {
		padding: var(--sp-6);
		display: flex;
		flex-direction: column;
		gap: var(--sp-6);
	}

	.section h3 {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		font-size: var(--text-ui-base);
		font-weight: 600;
		margin-bottom: var(--sp-2);
	}

	.section-icon {
		width: 20px;
		height: 20px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 12px;
		font-weight: 700;
	}

	.section-icon.in {
		background: #22c55e;
		color: white;
	}

	.section-icon.out {
		background: #ef4444;
		color: white;
	}

	.count {
		background: var(--amber);
		color: var(--color-chrome);
		font-size: var(--text-ui-sm);
		padding: 2px 8px;
		border-radius: 10px;
		font-weight: 500;
		margin-left: auto;
	}

	/* Assignments Section */
	.assignment-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: var(--sp-2);
	}

	.assignment-card {
		padding: var(--sp-4);
		border-radius: var(--radius-md);
		background: var(--surface-panel);
		border: 2px solid var(--amber);
	}

	.assignment-card.not-assigned {
		border-color: var(--border-default);
		background: var(--surface-page);
	}

	.assignment-type {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		margin-bottom: var(--sp-1);
	}

	.assignment-short {
		font-weight: 700;
		font-size: var(--text-ui-sm);
		color: var(--amber);
	}

	.assignment-name {
		font-size: var(--text-ui-sm);
		color: var(--text-tertiary);
	}

	.assignment-value {
		display: flex;
		flex-direction: column;
	}

	.assignee-name {
		font-weight: 600;
		font-size: var(--text-ui-base);
	}

	.assignee-details {
		font-size: var(--text-ui-sm);
		color: var(--text-tertiary);
	}

	.not-assigned-text {
		color: var(--text-tertiary);
		font-style: italic;
	}

	/* Personnel Groups */
	.personnel-groups {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
	}

	.group-block {
		background: var(--surface-page);
		border-radius: var(--radius-md);
		padding: var(--sp-2);
	}

	.group-label {
		font-size: var(--text-ui-sm);
		font-weight: 600;
		color: var(--amber);
		margin-bottom: var(--sp-1);
	}

	.personnel-chips {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-1);
	}

	.person-chip {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 4px 8px;
		background: var(--surface-panel);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-sm);
		font-size: var(--text-ui-sm);
	}

	.person-chip.has-assignment {
		border-color: var(--amber);
		background: #ebf8ff;
	}

	.chip-rank {
		font-weight: 600;
		color: var(--amber);
	}

	.assignment-badge {
		background: var(--amber);
		color: var(--color-chrome);
		font-size: 9px;
		font-weight: 700;
		padding: 1px 4px;
		border-radius: 2px;
		margin-left: 2px;
	}

	.person-chip.out {
		background: var(--surface-panel);
	}

	/* Status Groups */
	.status-groups {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
	}

	.status-group {
		background: var(--surface-page);
		border-radius: var(--radius-md);
		overflow: hidden;
	}

	.status-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--sp-1) var(--sp-2);
		font-size: var(--text-ui-sm);
		font-weight: 600;
	}

	.status-count {
		opacity: 0.8;
	}

	.status-personnel {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-1);
		padding: var(--sp-2);
	}

	.empty-message {
		color: var(--text-tertiary);
		font-style: italic;
		padding: var(--sp-4);
		text-align: center;
		background: var(--surface-page);
		border-radius: var(--radius-md);
	}

	.empty-message.success {
		background: #f0fdf4;
		color: #22c55e;
	}
</style>
