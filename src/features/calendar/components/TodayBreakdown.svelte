<script lang="ts">
	import type { Personnel } from '$lib/types';
	import type { AvailabilityEntry, StatusType } from '$features/calendar/calendar.types';
	import type { AssignmentType, DailyAssignment } from '../stores/dailyAssignments.svelte';
	import { formatDate } from '$lib/utils/dates';
	import Modal from '$lib/components/Modal.svelte';

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

	const today = new Date();
	const todayStr = formatDate(today);

	const dateDisplay = $derived(
		today.toLocaleDateString('en-US', {
			weekday: 'long',
			month: 'long',
			day: 'numeric',
			year: 'numeric'
		})
	);

	const allPersonnel = $derived(personnelByGroup.flatMap((g) => g.personnel));

	// Get today's assignments
	const todayAssignments = $derived(assignments.filter((a) => a.date === todayStr));

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
			.filter((e) => e.personnelId === personnelId && todayStr >= e.startDate && todayStr <= e.endDate)
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
		const personnelAssignments = new Map<string, string[]>();
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
		const groups = new Map<string, { status: StatusType; personnel: Personnel[] }>();

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

<Modal title="Today's Breakdown" {onClose} width="700px" titleId="breakdown-title">
	<div class="date-banner">{dateDisplay}</div>

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
					{#each assignmentInfo as info}
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
				<div class="empty-message">No one is available today</div>
			{:else}
				<div class="personnel-groups">
					{#each personnelByGroup as grp}
						{@const availableForGroup = personnelBreakdown.available.filter((p) => p.person.groupName === grp.group)}
						{#if availableForGroup.length > 0}
							<div class="group-block">
								<div class="group-label">{grp.group}</div>
								<div class="personnel-chips">
									{#each availableForGroup as { person, assignments }}
										<div class="person-chip" class:has-assignment={assignments.length > 0}>
											<span class="chip-rank">{person.rank}</span>
											<span class="chip-name">{person.lastName}</span>
											{#if assignments.length > 0}
												{#each assignments as badge}
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
				<div class="empty-message success">Everyone is available today!</div>
			{:else}
				<div class="status-groups">
					{#each outByStatus as { status, personnel }}
						<div class="status-group">
							<div class="status-header" style="background-color: {status.color}; color: {status.textColor}">
								{status.name}
								<span class="status-count">{personnel.length}</span>
							</div>
							<div class="status-personnel">
								{#each personnel as person}
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
		font-size: var(--font-size-lg);
		font-weight: 600;
		text-align: center;
		padding: var(--spacing-md) var(--spacing-lg);
		background: var(--color-primary);
		color: #0f0f0f;
		/* Bleed past modal-body padding to fill edge-to-edge */
		margin: calc(-1 * var(--spacing-md)) calc(-1 * var(--spacing-lg)) 0;
	}

	/* Stats Row */
	.stats-row {
		display: flex;
		justify-content: center;
		gap: var(--spacing-xl);
		padding: var(--spacing-md) var(--spacing-lg);
		background: var(--color-bg);
		border-bottom: 1px solid var(--color-border);
		/* Bleed past modal-body padding to fill edge-to-edge */
		margin: 0 calc(-1 * var(--spacing-lg));
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
		color: var(--color-primary);
	}

	.stat-label {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
		margin-top: var(--spacing-xs);
	}

	/* Content */
	.breakdown-content {
		padding: var(--spacing-lg);
		display: flex;
		flex-direction: column;
		gap: var(--spacing-lg);
	}

	.section h3 {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		font-size: var(--font-size-base);
		font-weight: 600;
		margin-bottom: var(--spacing-sm);
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
		background: var(--color-primary);
		color: #0f0f0f;
		font-size: var(--font-size-sm);
		padding: 2px 8px;
		border-radius: 10px;
		font-weight: 500;
		margin-left: auto;
	}

	/* Assignments Section */
	.assignment-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: var(--spacing-sm);
	}

	.assignment-card {
		padding: var(--spacing-md);
		border-radius: var(--radius-md);
		background: var(--color-surface);
		border: 2px solid var(--color-primary);
	}

	.assignment-card.not-assigned {
		border-color: var(--color-border);
		background: var(--color-bg);
	}

	.assignment-type {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		margin-bottom: var(--spacing-xs);
	}

	.assignment-short {
		font-weight: 700;
		font-size: var(--font-size-sm);
		color: var(--color-primary);
	}

	.assignment-name {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
	}

	.assignment-value {
		display: flex;
		flex-direction: column;
	}

	.assignee-name {
		font-weight: 600;
		font-size: var(--font-size-base);
	}

	.assignee-details {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
	}

	.not-assigned-text {
		color: var(--color-text-muted);
		font-style: italic;
	}

	/* Personnel Groups */
	.personnel-groups {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm);
	}

	.group-block {
		background: var(--color-bg);
		border-radius: var(--radius-md);
		padding: var(--spacing-sm);
	}

	.group-label {
		font-size: var(--font-size-sm);
		font-weight: 600;
		color: var(--color-primary);
		margin-bottom: var(--spacing-xs);
	}

	.personnel-chips {
		display: flex;
		flex-wrap: wrap;
		gap: var(--spacing-xs);
	}

	.person-chip {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 4px 8px;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		font-size: var(--font-size-sm);
	}

	.person-chip.has-assignment {
		border-color: var(--color-primary);
		background: #ebf8ff;
	}

	.chip-rank {
		font-weight: 600;
		color: var(--color-primary);
	}

	.assignment-badge {
		background: var(--color-primary);
		color: #0f0f0f;
		font-size: 9px;
		font-weight: 700;
		padding: 1px 4px;
		border-radius: 2px;
		margin-left: 2px;
	}

	.person-chip.out {
		background: var(--color-surface);
	}

	/* Status Groups */
	.status-groups {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-sm);
	}

	.status-group {
		background: var(--color-bg);
		border-radius: var(--radius-md);
		overflow: hidden;
	}

	.status-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: var(--spacing-xs) var(--spacing-sm);
		font-size: var(--font-size-sm);
		font-weight: 600;
	}

	.status-count {
		opacity: 0.8;
	}

	.status-personnel {
		display: flex;
		flex-wrap: wrap;
		gap: var(--spacing-xs);
		padding: var(--spacing-sm);
	}

	.empty-message {
		color: var(--color-text-muted);
		font-style: italic;
		padding: var(--spacing-md);
		text-align: center;
		background: var(--color-bg);
		border-radius: var(--radius-md);
	}

	.empty-message.success {
		background: #f0fdf4;
		color: #22c55e;
	}
</style>
