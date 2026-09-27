<script lang="ts">
	import type { Group } from '$features/personnel/contracts';
	import type { Personnel, AvailabilityEntry, StatusType, AssignmentType, DailyAssignment } from '$lib/types';
	import { formatDate } from '$lib/utils/dates';
	import * as AppDialog from '$lib/components/ui/app-dialog';
	import { SvelteMap } from 'svelte/reactivity';
	import { Button } from '$lib/components/ui/button';
	import { DatePicker } from '$lib/components/ui/date-picker';

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
		groups?: readonly Group[];
		onClose: () => void;
	}

	let {
		personnelByGroup,
		availabilityEntries,
		statusTypes,
		assignmentTypes,
		assignments,
		groups = [],
		onClose
	}: Props = $props();

	let selectedDate = $state(new Date());
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

	function handleDatePickerValue(value: string) {
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
	const statusTypesById = $derived(new SvelteMap(statusTypes.map((status) => [status.id, status])));

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
					assigneeName = groups.find((group) => group.id === assignment.assigneeId)?.name ?? 'Unknown Group';
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

	const statusesByPersonnelForSelectedDate = $derived.by(() => {
		const grouped = new SvelteMap<string, { status: StatusType; entry: AvailabilityEntry }[]>();

		for (const entry of availabilityEntries) {
			if (selectedDateStr < entry.startDate || selectedDateStr > entry.endDate) continue;

			const status = statusTypesById.get(entry.statusTypeId);
			if (!status) continue;

			const statuses = grouped.get(entry.personnelId) ?? [];
			statuses.push({ status, entry });
			grouped.set(entry.personnelId, statuses);
		}

		return grouped;
	});

	// Categorize personnel
	const personnelBreakdown = $derived.by(() => {
		const available: { person: Personnel; assignments: { typeId: string; shortName: string }[] }[] = [];
		const unavailable: { person: Personnel; statuses: { status: StatusType; entry: AvailabilityEntry }[] }[] = [];

		// Find who has assignments today
		const personnelAssignments = new SvelteMap<string, { typeId: string; shortName: string }[]>();
		for (const info of assignmentInfo) {
			if (info.assignment && info.type.assignTo === 'personnel') {
				const current = personnelAssignments.get(info.assignment.assigneeId) || [];
				current.push({ typeId: info.type.id, shortName: info.type.shortName });
				personnelAssignments.set(info.assignment.assigneeId, current);
			}
		}

		for (const person of allPersonnel) {
			const statuses = statusesByPersonnelForSelectedDate.get(person.id) ?? [];
			const assignments = personnelAssignments.get(person.id) || [];

			if (statuses.length === 0) {
				available.push({ person, assignments });
			} else {
				unavailable.push({ person, statuses });
			}
		}

		return { available, unavailable };
	});

	const availablePersonnelByGroup = $derived.by(() => {
		const grouped = new SvelteMap<
			string,
			{ person: Personnel; assignments: { typeId: string; shortName: string }[] }[]
		>();

		for (const group of personnelByGroup) {
			grouped.set(group.group, []);
		}

		for (const entry of personnelBreakdown.available) {
			const group = grouped.get(entry.person.groupName);
			if (group) {
				group.push(entry);
			}
		}

		return personnelByGroup
			.map((group) => ({
				group: group.group,
				available: grouped.get(group.group) ?? []
			}))
			.filter((group) => group.available.length > 0);
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

<AppDialog.Root open {onClose}>
	<AppDialog.Content size="wide">
		<AppDialog.Header>
			<AppDialog.Title id="breakdown-title">{isToday ? "Today's Breakdown" : 'Daily Breakdown'}</AppDialog.Title>
			<AppDialog.Description>{dateDisplay}</AppDialog.Description>
		</AppDialog.Header>

		<div class="bg-muted flex items-center justify-center gap-2 border-y px-4 py-2">
			<Button
				variant="outline"
				size="icon-sm"
				onclick={() => shiftDate(-1)}
				title="Previous day"
				aria-label="Previous day">&lsaquo;</Button
			>
			<DatePicker
				value={inputDateStr}
				onValueChange={handleDatePickerValue}
				aria-label="Select breakdown date"
				class="w-56"
			/>
			<Button variant="outline" size="icon-sm" onclick={() => shiftDate(1)} title="Next day" aria-label="Next day"
				>&rsaquo;</Button
			>
		</div>

		<div class="bg-card flex justify-center gap-8 border-b px-6 py-4">
			<div class="flex flex-col items-center">
				<span class="text-primary text-2xl leading-none font-bold">{personnelBreakdown.available.length}</span>
				<span class="text-muted-foreground text-xs uppercase">Available</span>
			</div>
			<div class="flex flex-col items-center">
				<span class="text-destructive text-2xl leading-none font-bold">{personnelBreakdown.unavailable.length}</span>
				<span class="text-muted-foreground text-xs uppercase">Out</span>
			</div>
			<div class="flex flex-col items-center">
				<span class="text-2xl leading-none font-bold">{allPersonnel.length}</span>
				<span class="text-muted-foreground text-xs uppercase">Total</span>
			</div>
		</div>

		<AppDialog.Body class="grid gap-4">
			{#if assignmentInfo.length > 0}
				<section class="grid gap-2">
					<h3 class="text-sm font-semibold">Daily Assignments</h3>
					<div class="grid gap-2 sm:grid-cols-2">
						{#each assignmentInfo as info (info.type.id)}
							<div class={['rounded-lg border p-3', info.isAssigned ? 'bg-card' : 'bg-muted/40 opacity-80']}>
								<div class="mb-1 flex items-center gap-2">
									<span
										class="bg-primary text-primary-foreground rounded-md px-1.5 py-0.5 font-mono text-xs font-semibold uppercase"
									>
										{info.type.shortName}
									</span>
									<span class="text-muted-foreground text-xs font-medium">{info.type.name}</span>
								</div>
								<div class="grid gap-0.5">
									{#if info.isAssigned}
										<span class="text-sm font-semibold">{info.assigneeName}</span>
										{#if info.assigneeDetails}
											<span class="text-muted-foreground text-xs">{info.assigneeDetails}</span>
										{/if}
									{:else}
										<span class="text-muted-foreground text-sm">Not Assigned</span>
									{/if}
								</div>
							</div>
						{/each}
					</div>
				</section>
			{/if}

			<section class="grid gap-2">
				<h3 class="flex items-center gap-2 text-sm font-semibold">
					<span class="text-primary" aria-hidden="true">&#10003;</span>
					Available
					<span class="text-muted-foreground text-xs">{personnelBreakdown.available.length}</span>
				</h3>
				{#if personnelBreakdown.available.length === 0}
					<div class="text-muted-foreground rounded-lg border border-dashed p-4 text-center text-sm">
						No one is available {isToday ? 'today' : 'this day'}
					</div>
				{:else}
					<div class="grid gap-3">
						{#each availablePersonnelByGroup as group (group.group)}
							<div class="grid gap-1">
								<div class="text-muted-foreground font-mono text-xs font-semibold tracking-wide uppercase">
									{group.group}
								</div>
								<div class="flex flex-wrap gap-1.5">
									{#each group.available as { person, assignments } (person.id)}
										<div
											class={[
												'inline-flex items-center gap-1 rounded-md border px-2 py-1 text-sm',
												assignments.length > 0 ? 'bg-secondary text-secondary-foreground' : 'bg-card'
											]}
										>
											<span class="text-muted-foreground font-mono text-xs">{person.rank}</span>
											<span class="font-medium">{person.lastName}</span>
											{#if assignments.length > 0}
												{#each assignments as badge (badge.typeId)}
													<span
														class="bg-primary text-primary-foreground rounded px-1 font-mono text-[10px] font-semibold uppercase"
														>{badge.shortName}</span
													>
												{/each}
											{/if}
										</div>
									{/each}
								</div>
							</div>
						{/each}
					</div>
				{/if}
			</section>

			<section class="grid gap-2">
				<h3 class="flex items-center gap-2 text-sm font-semibold">
					<span class="text-destructive" aria-hidden="true">&#10007;</span>
					Unavailable
					<span class="text-muted-foreground text-xs">{personnelBreakdown.unavailable.length}</span>
				</h3>
				{#if personnelBreakdown.unavailable.length === 0}
					<div class="text-muted-foreground rounded-lg border border-dashed p-4 text-center text-sm">
						Everyone is available{isToday ? ' today' : ''}!
					</div>
				{:else}
					<div class="grid gap-3">
						{#each outByStatus as { status, personnel } (status.id)}
							<div class="overflow-hidden rounded-lg border">
								<div
									class="flex items-center justify-between px-3 py-1.5 text-sm font-semibold"
									style="background-color: {status.color}; color: {status.textColor}"
								>
									{status.name}
									<span class="rounded-full bg-black/15 px-2 py-0.5 text-xs">{personnel.length}</span>
								</div>
								<div class="flex flex-wrap gap-1.5 p-2">
									{#each personnel as person (person.id)}
										<div class="bg-card inline-flex items-center gap-1 rounded-md border px-2 py-1 text-sm">
											<span class="text-muted-foreground font-mono text-xs">{person.rank}</span>
											<span class="font-medium">{person.lastName}</span>
										</div>
									{/each}
								</div>
							</div>
						{/each}
					</div>
				{/if}
			</section>
		</AppDialog.Body>

		<AppDialog.Footer>
			<Button onclick={onClose}>Close</Button>
		</AppDialog.Footer>
	</AppDialog.Content>
</AppDialog.Root>
