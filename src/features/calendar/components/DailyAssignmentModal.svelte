<script lang="ts">
	import type { Personnel, AssignmentType, DailyAssignment } from '$lib/types';
	import type { DutyEvent } from '$features/duty-roster/duty-roster.types';
	import { formatDate } from '$lib/utils/dates';
	import Modal from '$lib/components/Modal.svelte';
	import SearchSelect from '$lib/components/ui/SearchSelect.svelte';

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
		dutyEvents?: DutyEvent[];
		dutyRosterHref?: string;
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
		dutyEvents = [],
		dutyRosterHref,
		onSetAssignment,
		onRemoveAssignment,
		onClose
	}: Props = $props();

	function eventCoversDate(event: DutyEvent, d: string): boolean {
		const startDate = event.coverageStart.slice(0, 10);
		const endDateRaw = event.coverageEnd.slice(0, 10);
		const endTime = event.coverageEnd.slice(11, 19);
		const endDate = endTime === '00:00:00' ? null : endDateRaw;
		if (d < startDate) return false;
		if (!endDate) return d === startDate;
		return d <= endDate;
	}

	function formatCoverage(event: DutyEvent): string {
		const fmt = (iso: string) => {
			const [datePart, timePart] = iso.split('T');
			const [y, m, day] = datePart.split('-');
			const [h, min] = (timePart ?? '').split(':');
			const d = new Date(Number(y), Number(m) - 1, Number(day));
			const label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
			return `${label} ${h}:${min}`;
		};
		return `${fmt(event.coverageStart)} – ${fmt(event.coverageEnd)}`;
	}

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
	const dutyEventsForDate = $derived(dutyEvents.filter((e) => eventCoversDate(e, dateStr)));
	const personnelOptions = $derived(
		personnelByGroup.flatMap((grp) =>
			grp.personnel.map((person) => ({
				value: person.id,
				label: `${person.rank} ${person.lastName}, ${person.firstName}${grp.group ? ` - ${grp.group}` : ''}`
			}))
		)
	);
	const groupOptions = $derived(groups.map((group) => ({ value: group, label: group })));

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
</script>

<Modal title="Daily Assignments" {onClose} width="520px" titleId="daily-assign-title">
	<div class="date-display">{dateDisplay}</div>

	{#if dutyEventsForDate.length > 0}
		<div class="duty-events-section">
			<h4 class="duty-events-heading">Advanced duty events</h4>
			{#each dutyEventsForDate as event (event.id)}
				<div class="duty-event-row">
					{#if dutyRosterHref}
						<a href={dutyRosterHref} class="duty-event-name">{event.templateName}</a>
					{:else}
						<span class="duty-event-name">{event.templateName}</span>
					{/if}
					<span class="duty-event-meta"
						>{formatCoverage(event)} · {event.fillSummary.filledSlots} of {event.fillSummary.totalSlots} filled</span
					>
				</div>
			{/each}
		</div>
	{/if}

	<div class="assignments-list">
		{#each assignmentTypes as type (type.id)}
			<div class="assignment-row">
				<div class="assignment-label">
					<span class="assignment-badge" style="background-color: {type.color}">{type.shortName}</span>
					<span class="assignment-name">{type.name}</span>
				</div>

				{#if type.assignTo === 'personnel'}
					<SearchSelect
						options={personnelOptions}
						value={getCurrentAssignee(type.id)}
						placeholder="Not assigned"
						ariaLabel={`Set ${type.name} assignee`}
						onchange={(value) => handleAssignmentChange(type.id, value)}
					/>
				{:else}
					<SearchSelect
						options={groupOptions}
						value={getCurrentAssignee(type.id)}
						placeholder="Not assigned"
						ariaLabel={`Set ${type.name} group`}
						onchange={(value) => handleAssignmentChange(type.id, value)}
					/>
				{/if}
			</div>
		{/each}
	</div>

	{#snippet footer()}
		<button class="btn btn-primary" onclick={onClose}>Done</button>
	{/snippet}
</Modal>

<style>
	.date-display {
		margin-bottom: var(--sp-4);
		padding-bottom: var(--sp-4);
		border-bottom: var(--border-thin);
		font-family: var(--font-display);
		font-size: clamp(1.35rem, 1.1rem + 0.6vw, 1.8rem);
		font-weight: var(--font-weight-display);
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.duty-events-section {
		margin-bottom: var(--sp-4);
		padding-bottom: var(--sp-4);
		border-bottom: var(--border-thin);
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
	}

	.duty-events-heading {
		margin: 0 0 var(--sp-1);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: var(--letter-spacing-mono);
		text-transform: uppercase;
		color: var(--text-secondary);
	}

	.duty-event-row {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.duty-event-name {
		font-size: var(--text-sm);
		font-weight: var(--font-weight-medium);
		color: var(--text-primary);
		text-decoration: none;
	}

	a.duty-event-name:hover {
		text-decoration: underline;
	}

	.duty-event-meta {
		font-size: var(--text-xs);
		color: var(--text-secondary);
	}

	.assignments-list {
		display: flex;
		flex-direction: column;
		gap: var(--sp-3);
	}

	.assignment-row {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
		padding: var(--sp-3);
		background: var(--surface-subtle);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-sm);
	}

	.assignment-label {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		flex-wrap: wrap;
	}

	.assignment-badge {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 2px 6px;
		border-radius: var(--radius-sm);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: white;
	}

	.assignment-name {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-secondary);
	}
</style>
