<script lang="ts">
	import type { Personnel, AssignmentType, DailyAssignment } from '$lib/types';
	import type { DutyEvent } from '$features/duty-roster/duty-roster.types';
	import { formatDate } from '$lib/utils/dates';
	import Modal from '$lib/components/Modal.svelte';
	import SearchSelect from '$lib/components/ui/SearchSelect.svelte';
	import { Button } from '$lib/components/ui/button';

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
	<div class="border-b pb-4 font-display text-xl font-bold tracking-wide uppercase">{dateDisplay}</div>

	{#if dutyEventsForDate.length > 0}
		<div class="mt-4 flex flex-col gap-2 border-b pb-4">
			<h4 class="text-muted-foreground text-xs font-semibold tracking-wide uppercase">Advanced duty events</h4>
			{#each dutyEventsForDate as event (event.id)}
				<div class="flex flex-col gap-0.5">
					{#if dutyRosterHref}
						<a href={dutyRosterHref} class="text-sm font-medium hover:underline">{event.templateName}</a>
					{:else}
						<span class="text-sm font-medium">{event.templateName}</span>
					{/if}
					<span class="text-muted-foreground text-xs"
						>{formatCoverage(event)} · {event.fillSummary.filledSlots} of {event.fillSummary.totalSlots} filled</span
					>
				</div>
			{/each}
		</div>
	{/if}

	<div class="mt-4 flex flex-col gap-3">
		{#each assignmentTypes as type (type.id)}
			<div class="bg-muted/30 flex flex-col gap-2 rounded-lg border p-3">
				<div class="flex flex-wrap items-center gap-2">
					<span
						class="inline-flex min-w-7 items-center justify-center rounded-md px-1.5 py-0.5 font-mono text-xs font-semibold tracking-wide text-white uppercase"
						style="background-color: {type.color}">{type.shortName}</span
					>
					<span class="text-muted-foreground font-mono text-xs font-semibold tracking-wide uppercase">{type.name}</span>
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
		<Button onclick={onClose}>Done</Button>
	{/snippet}
</Modal>
