<script lang="ts">
	import type { Personnel, AssignmentType, DailyAssignment } from '$lib/types';
	import { formatDate, getMonthDates, getMonthName, isWeekend, addMonths } from '$lib/utils/dates';
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Combobox from '$lib/components/ui/combobox';
	import { NativeSelect } from '$lib/components/ui/native-select';
	import ChevronLeftIcon from '@lucide/svelte/icons/chevron-left';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';

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
	let viewDate = $derived(new Date(currentDate));

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

<div class="bg-card overflow-hidden rounded-lg border">
	<div class="bg-muted/30 flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
		<div class="inline-flex flex-wrap items-center gap-2">
			<Button variant="outline" size="icon-sm" onclick={prevMonth} aria-label="Previous month">
				<ChevronLeftIcon />
			</Button>
			<Button variant="outline" size="sm" onclick={goToCurrentMonth}>Today</Button>
		</div>

		<h3 class="font-display min-w-44 text-center text-xl font-bold tracking-wide uppercase">{monthName} {year}</h3>

		<div class="inline-flex justify-end">
			<Button variant="outline" size="icon-sm" onclick={nextMonth} aria-label="Next month">
				<ChevronRightIcon />
			</Button>
		</div>
	</div>

	<div class="bg-muted/20 border-b px-5 py-4">
		<h4 class="text-muted-foreground mb-3 font-mono text-xs font-semibold tracking-wide uppercase">Quick Fill</h4>
		<div class="flex flex-wrap items-center gap-2">
			<div class="min-w-48 flex-1">
				<Combobox.Root
					items={assignmentTypeOptions}
					bind:value={quickFillType}
					label="Select assignment type"
					autoHighlight
				>
					<Combobox.Trigger placeholder="Select assignment type..." aria-label="Select assignment type" />
					<Combobox.Content>
						<Combobox.Empty>No assignment types found.</Combobox.Empty>
						<Combobox.List>
							{#each assignmentTypeOptions as option (option.value)}
								<Combobox.Item value={option.value}>{option.label}</Combobox.Item>
							{/each}
						</Combobox.List>
					</Combobox.Content>
				</Combobox.Root>
			</div>

			{#if selectedType?.assignTo === 'personnel'}
				<div class="quick-fill-control">
					<Combobox.Root
						items={personnelOptions}
						bind:value={quickFillPerson}
						label="Select quick-fill person"
						autoHighlight
					>
						<Combobox.Trigger clearable placeholder="Search personnel..." aria-label="Select quick-fill person" />
						<Combobox.Content>
							<Combobox.Search placeholder="Search personnel..." />
							<Combobox.Empty>No personnel found.</Combobox.Empty>
							<Combobox.List />
						</Combobox.Content>
					</Combobox.Root>
				</div>
			{:else if selectedType?.assignTo === 'group'}
				<div class="quick-fill-control">
					<Combobox.Root items={groupOptions} bind:value={quickFillGroup} label="Select quick-fill group" autoHighlight>
						<Combobox.Trigger clearable placeholder="Select group..." aria-label="Select quick-fill group" />
						<Combobox.Content>
							<Combobox.Empty>No groups found.</Combobox.Empty>
							<Combobox.List>
								{#each groupOptions as option (option.value)}
									<Combobox.Item value={option.value}>{option.label}</Combobox.Item>
								{/each}
							</Combobox.List>
						</Combobox.Content>
					</Combobox.Root>
				</div>
			{/if}

			<NativeSelect bind:value={quickFillDays} class="w-[150px]">
				<option value="weekdays">Weekdays only</option>
				<option value="weekends">Weekends only</option>
				<option value="all">All days</option>
			</NativeSelect>

			<Button size="sm" onclick={applyQuickFill} disabled={!quickFillType || !quickFillAssigneeSelected || isApplying}>
				{isApplying ? 'Applying...' : 'Apply'}
			</Button>
		</div>
	</div>

	<div class="overflow-x-auto">
		<table class="w-full border-collapse text-sm">
			<thead>
				<tr class="bg-muted/40 border-b">
					<th class="w-14 px-3 py-2 text-left font-medium">Date</th>
					<th class="w-14 px-3 py-2 text-left font-medium">Day</th>
					{#each assignmentTypes as type (type.id)}
						<th class="min-w-40 px-3 py-2 text-left font-medium">
							<div class="flex items-center justify-between gap-2">
								<span
									class="rounded-md px-1.5 py-0.5 font-mono text-xs font-semibold text-white uppercase"
									style="background-color: {type.color}">{type.shortName}</span
								>
								<Button
									variant="ghost"
									size="icon-xs"
									onclick={() => clearAll(type.id)}
									title="Clear all {type.name}"
									aria-label="Clear all {type.name}"
								>
									<Trash2Icon />
								</Button>
							</div>
						</th>
					{/each}
				</tr>
			</thead>
			<tbody>
				{#each dates as date (formatDate(date))}
					{@const dateStr = formatDate(date)}
					{@const weekend = isWeekend(date)}
					{@const dayName = date.toLocaleDateString('en-US', { weekday: 'short' })}
					{@const isToday = formatDate(new Date()) === dateStr}
					<tr class={['border-b last:border-b-0', weekend && 'bg-muted/30', isToday && 'bg-primary/10']}>
						<td class="px-3 py-2">
							<span class="font-semibold">{date.getDate()}</span>
						</td>
						<td class="px-3 py-2">
							<span class="text-muted-foreground font-mono text-xs uppercase">{dayName}</span>
						</td>
						{#each assignmentTypes as type (type.id)}
							{@const assignment = getAssignment(date, type.id)}
							<td class="px-2 py-1.5">
								{#if type.assignTo === 'personnel'}
									<Combobox.Root
										items={personnelOptions}
										value={assignment?.assigneeId ?? ''}
										label={`Select ${type.name} assignee for ${dateStr}`}
										onValueChange={(value) =>
											handleChange(date, type.id, Array.isArray(value) ? (value[0] ?? '') : value)}
										autoHighlight
									>
										<Combobox.Trigger
											clearable
											placeholder="-"
											aria-label={`Select ${type.name} assignee for ${dateStr}`}
										/>
										<Combobox.Content>
											<Combobox.Search placeholder="Search personnel..." />
											<Combobox.Empty>No personnel found.</Combobox.Empty>
											<Combobox.List />
										</Combobox.Content>
									</Combobox.Root>
								{:else}
									<Combobox.Root
										items={groupOptions}
										value={assignment?.assigneeId ?? ''}
										label={`Select ${type.name} group for ${dateStr}`}
										onValueChange={(value) =>
											handleChange(date, type.id, Array.isArray(value) ? (value[0] ?? '') : value)}
										autoHighlight
									>
										<Combobox.Trigger
											clearable
											placeholder="-"
											aria-label={`Select ${type.name} group for ${dateStr}`}
										/>
										<Combobox.Content>
											<Combobox.Empty>No groups found.</Combobox.Empty>
											<Combobox.List>
												{#each groupOptions as option (option.value)}
													<Combobox.Item value={option.value}>{option.label}</Combobox.Item>
												{/each}
											</Combobox.List>
										</Combobox.Content>
									</Combobox.Root>
								{/if}
							</td>
						{/each}
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	<div class="text-muted-foreground border-t px-5 py-3 text-sm">{dates.length} days in {monthName}</div>
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
