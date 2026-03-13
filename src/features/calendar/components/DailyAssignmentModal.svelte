<script lang="ts">
	import type { Personnel } from '$lib/types';
	import type { AssignmentType, DailyAssignment } from '../stores/dailyAssignments.svelte';
	import { formatDate } from '$lib/utils/dates';
	import Modal from '$lib/components/Modal.svelte';

	interface GroupData {
		group: string;
		personnel: Personnel[];
	}

	interface Props {
		date: Date;
		assignmentTypes: AssignmentType[];
		assignments: DailyAssignment[];
		personnelByGroup: GroupData[];
		groups: string[];
		onSetAssignment: (date: string, typeId: string, assigneeId: string) => void;
		onRemoveAssignment: (date: string, typeId: string) => void;
		onClose: () => void;
	}

	let {
		date,
		assignmentTypes,
		assignments,
		personnelByGroup,
		groups,
		onSetAssignment,
		onRemoveAssignment,
		onClose
	}: Props = $props();

	const dateStr = $derived(formatDate(date));
	const dateDisplay = $derived(
		date.toLocaleDateString('en-US', {
			weekday: 'long',
			year: 'numeric',
			month: 'long',
			day: 'numeric'
		})
	);

	const assignmentsForDate = $derived(assignments.filter((a) => a.date === dateStr));

	const allPersonnel = $derived(personnelByGroup.flatMap((g) => g.personnel));

	// MOD-eligible MOS codes
	const MOD_ELIGIBLE_MOS = ['PA', 'MD'];

	// Get eligible personnel grouped by type
	function getEligiblePersonnelByGroup(type: AssignmentType): GroupData[] {
		if (type.shortName === 'MOD') {
			return personnelByGroup
				.map((g) => ({
					...g,
					personnel: g.personnel.filter((p) =>
						MOD_ELIGIBLE_MOS.some((mos) => p.mos.toUpperCase().includes(mos))
					)
				}))
				.filter((g) => g.personnel.length > 0);
		}
		return personnelByGroup;
	}

	function getCurrentAssignee(typeId: string): string {
		const assignment = assignmentsForDate.find((a) => a.assignmentTypeId === typeId);
		return assignment?.assigneeId ?? '';
	}

	function handleAssignmentChange(typeId: string, assigneeId: string) {
		if (assigneeId) {
			onSetAssignment(dateStr, typeId, assigneeId);
		} else {
			onRemoveAssignment(dateStr, typeId);
		}
	}

	function getPersonnelDisplay(id: string): string {
		const person = allPersonnel.find((p) => p.id === id);
		if (person) {
			return `${person.rank} ${person.lastName}`;
		}
		return id;
	}
</script>

<Modal title="Daily Assignments" {onClose} width="450px" titleId="daily-assign-title">
	<div class="date-display">{dateDisplay}</div>

	<div class="assignments-list">
		{#each assignmentTypes as type (type.id)}
			<div class="assignment-row">
				<label class="assignment-label">
					<span class="assignment-badge" style="background-color: {type.color}"
						>{type.shortName}</span
					>
					<span class="assignment-name">{type.name}</span>
				</label>

				{#if type.assignTo === 'personnel'}
					{@const eligibleGroups = getEligiblePersonnelByGroup(type)}
					<select
						class="select"
						value={getCurrentAssignee(type.id)}
						onchange={(e) => handleAssignmentChange(type.id, e.currentTarget.value)}
					>
						<option value="">-- Not Assigned --</option>
						{#each eligibleGroups as grp}
							{#if grp.personnel.length > 0}
								<optgroup label={grp.group}>
									{#each grp.personnel as person}
										<option value={person.id}>
											{person.rank}
											{person.lastName}, {person.firstName}
										</option>
									{/each}
								</optgroup>
							{/if}
						{/each}
					</select>
					{#if type.shortName === 'MOD'}
						<span class="filter-hint">Only PA/MD personnel are eligible</span>
					{/if}
				{:else}
					<select
						class="select"
						value={getCurrentAssignee(type.id)}
						onchange={(e) => handleAssignmentChange(type.id, e.currentTarget.value)}
					>
						<option value="">-- Not Assigned --</option>
						{#each groups as group}
							<option value={group}>{group}</option>
						{/each}
					</select>
				{/if}
			</div>
		{/each}
	</div>

	{#if assignmentsForDate.length > 0}
		<div class="current-assignments">
			<h4>Current Assignments:</h4>
			{#each assignmentsForDate as assignment}
				{@const type = assignmentTypes.find((t) => t.id === assignment.assignmentTypeId)}
				{#if type}
					<div class="current-assignment">
						<span class="assignment-badge" style="background-color: {type.color}"
							>{type.shortName}</span
						>
						<span>
							{#if type.assignTo === 'personnel'}
								{getPersonnelDisplay(assignment.assigneeId)}
							{:else}
								{assignment.assigneeId}
							{/if}
						</span>
					</div>
				{/if}
			{/each}
		</div>
	{/if}

	{#snippet footer()}
		<button class="btn btn-primary" onclick={onClose}>Done</button>
	{/snippet}
</Modal>

<style>
	.date-display {
		font-size: var(--font-size-lg);
		font-weight: 600;
		margin-bottom: var(--spacing-lg);
		padding-bottom: var(--spacing-md);
		border-bottom: 1px solid var(--color-border);
	}

	.assignments-list {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-md);
	}

	.assignment-row {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-xs);
	}

	.assignment-label {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		font-weight: 500;
	}

	.assignment-badge {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 2px 6px;
		border-radius: var(--radius-sm);
		font-size: 10px;
		font-weight: 700;
		color: white;
	}

	.assignment-name {
		font-size: var(--font-size-sm);
	}

	.current-assignments {
		margin-top: var(--spacing-lg);
		padding-top: var(--spacing-md);
		border-top: 1px solid var(--color-border);
	}

	.current-assignments h4 {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
		margin-bottom: var(--spacing-sm);
	}

	.current-assignment {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		padding: var(--spacing-xs) 0;
		font-size: var(--font-size-sm);
	}

	.filter-hint {
		font-size: var(--font-size-xs);
		color: var(--color-text-muted);
		font-style: italic;
	}
</style>
