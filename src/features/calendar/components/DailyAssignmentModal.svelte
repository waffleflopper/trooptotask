<script lang="ts">
	import { buildGroupTree, type Group } from '$features/personnel/contracts';
	import { TreeSelect, type TreeSelectOption } from '$lib/components/patterns/tree-select';
	import type { Personnel } from '$features/personnel/contracts';
	import type { AssignmentType, DailyAssignment } from '$features/calendar/contracts';
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
	const tree = $derived(buildGroupTree(groups));
	// Group ids are UUIDs, so this never collides with one.
	const NO_GROUP = '__none';
	const groupLabel = (id: string) => (tree.node(id) ? tree.label(id) : 'Another group');

	function groupChoices(current: string): TreeSelectOption[] {
		const nodes = tree.ordered.map((node) => ({ id: node.id, label: node.name, depth: node.level }));
		if (!current) return nodes;
		const kept = tree.node(current) ? [] : [{ id: current, label: 'Another group', depth: 0, aside: true }];
		return [...nodes, ...kept, { id: NO_GROUP, label: 'No group', depth: 0, aside: true }];
	}

	// A current excused assignee stays listed so the assignment can still be seen and cleared.
	function personnelChoices(type: AssignmentType) {
		const current = getCurrentAssignee(type.id);
		return personnelOptions.filter(
			(option) => option.value === current || !type.excusals.some(({ personId }) => personId === option.value)
		);
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
					{@const current = getCurrentAssignee(type.id)}
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

						{#if type.assignTo === 'group'}
							<TreeSelect
								options={groupChoices(current)}
								value={current || null}
								onValueChange={(id: string) => handleAssignmentChange(type.id, id === NO_GROUP ? '' : id)}
								label={`Set ${type.name} group`}
								hideLabel
								valueLabel={current ? groupLabel(current) : null}
								placeholder="No group"
								searchPlaceholder="Find a Group"
								class="h-9 w-full justify-between"
							/>
						{:else}
							<Combobox.Root
								items={personnelChoices(type)}
								value={current}
								label={`Set ${type.name} assignee`}
								onValueChange={(value) =>
									handleAssignmentChange(type.id, Array.isArray(value) ? (value[0] ?? '') : value)}
								autoHighlight
							>
								<Combobox.Trigger
									clearable
									placeholder="Search assignments..."
									aria-label={`Set ${type.name} assignee`}
								/>
								<Combobox.Content>
									<Combobox.Search placeholder="Search assignments..." />
									<Combobox.Empty>No assignments found.</Combobox.Empty>
									<Combobox.List />
								</Combobox.Content>
							</Combobox.Root>
						{/if}
					</div>
				{:else}
					<p class="text-sm text-muted-foreground">
						No assignment types are set up yet. Add one in Calendar settings to assign daily duties.
					</p>
				{/each}
			</div>
		</AppDialog.Body>

		<AppDialog.Footer>
			<Button onclick={onClose}>Done</Button>
		</AppDialog.Footer>
	</AppDialog.Content>
</AppDialog.Root>
