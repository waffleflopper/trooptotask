<script lang="ts">
	import type { Group } from '$lib/stores/groups.svelte';
	import type { Personnel, AssignmentType, DailyAssignment } from '$lib/types';
	import { formatDate } from '$lib/utils/dates';
	import * as AppDialog from '$lib/components/ui/app-dialog';
	import { Button } from '$lib/components/ui/button';
	import * as Combobox from '$lib/components/ui/combobox';

	interface GroupData {
		group: string;
		personnel: Personnel[];
	}

	interface Props {
		date: Date;
		assignmentTypes: AssignmentType[];
		assignments: DailyAssignment[];
		personnelByGroup: GroupData[];
		groups: readonly Group[];
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
	const activeAssignmentTypes = $derived(assignmentTypes.filter((type) => !type.archivedAt));
	const personnelOptions = $derived(
		personnelByGroup.flatMap((grp) =>
			grp.personnel.map((person) => ({
				value: person.id,
				label: `${person.rank} ${person.lastName}, ${person.firstName}${grp.group ? ` - ${grp.group}` : ''}`
			}))
		)
	);
	const groupOptions = $derived(groups.map((group) => ({ value: group.id, label: group.name })));

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

<AppDialog.Root open {onClose}>
	<AppDialog.Content>
		<AppDialog.Header>
			<AppDialog.Title id="daily-assign-title">Daily Assignments</AppDialog.Title>
			<AppDialog.Description>{dateDisplay}</AppDialog.Description>
		</AppDialog.Header>

		<AppDialog.Body class="space-y-4">
			<div class="flex flex-col gap-3">
				{#each activeAssignmentTypes as type (type.id)}
					{@const options = type.assignTo === 'personnel' ? personnelOptions : groupOptions}
					<div class="bg-muted/30 flex flex-col gap-2 rounded-lg border p-3">
						<div class="flex flex-wrap items-center gap-2">
							<span
								class="inline-flex min-w-7 items-center justify-center rounded-md px-1.5 py-0.5 font-mono text-xs font-semibold tracking-wide text-white uppercase"
								style="background-color: {type.color}">{type.shortName}</span
							>
							<span class="text-muted-foreground font-mono text-xs font-semibold tracking-wide uppercase"
								>{type.name}</span
							>
						</div>

						<Combobox.Root
							items={options}
							value={getCurrentAssignee(type.id)}
							label={`Set ${type.name} ${type.assignTo === 'personnel' ? 'assignee' : 'group'}`}
							onValueChange={(value) =>
								handleAssignmentChange(type.id, Array.isArray(value) ? (value[0] ?? '') : value)}
							autoHighlight
						>
							<Combobox.Trigger
								clearable
								placeholder="Search assignments..."
								aria-label={`Set ${type.name} ${type.assignTo === 'personnel' ? 'assignee' : 'group'}`}
							/>
							<Combobox.Content>
								<Combobox.Search placeholder="Search assignments..." />
								<Combobox.Empty>No assignments found.</Combobox.Empty>
								<Combobox.List />
							</Combobox.Content>
						</Combobox.Root>
					</div>
				{/each}
			</div>
		</AppDialog.Body>

		<AppDialog.Footer>
			<Button onclick={onClose}>Done</Button>
		</AppDialog.Footer>
	</AppDialog.Content>
</AppDialog.Root>
