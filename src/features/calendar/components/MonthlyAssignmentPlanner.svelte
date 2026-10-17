<script lang="ts">
	import { untrack } from 'svelte';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
	import type {
		AssignmentType,
		AvailabilityEntry,
		DailyAssignment,
		SpecialDay,
		StatusType
	} from '$features/calendar/contracts';
	import type { Group, Personnel } from '$features/personnel/contracts';
	import {
		buildPlannerTable,
		buildQuickFillBatch,
		type AssignmentWrite,
		type PlannerCell,
		type PlannerColumn,
		type PlannerRow
	} from '$features/calendar/utils/assignmentPlanner';
	import { assignmentSlotKey, indexAssignmentsBySlot } from '$features/calendar/utils/calendarIndexes';
	import { plannerColumns } from '$features/calendar/utils/calendarLanes';
	import { dutyPickerOptions, eligibleAssignees } from '$features/calendar/utils/dutyPickerOptions';
	import { dutyFairness } from '$features/calendar/utils/dutyFairness';
	import { findDutyConflicts, indexDutyAvailability, indexDutyHistory } from '$features/calendar/utils/dutyReadModel';
	import { endOfMonth, formatDate, getMonthName, parseDate } from '$lib/utils/dates';
	import { Button } from '$lib/components/ui/button';
	import { ConfirmDialog } from '$lib/components/ui/confirm-dialog';
	import * as Table from '$lib/components/ui/table';
	import AssignmentCodeChip from './AssignmentCodeChip.svelte';
	import AssignmentConflictsPanel from './AssignmentConflictsPanel.svelte';
	import AssignmentPlannerColumnMenu from './AssignmentPlannerColumnMenu.svelte';
	import DutyFairnessPanel from './DutyFairnessPanel.svelte';
	import DutyPicker from './DutyPicker.svelte';

	interface GroupData {
		group: string;
		personnel: Personnel[];
	}

	interface Props {
		currentDate: Date;
		rangeStatus: 'ready' | 'loading' | 'error';
		onRetry: () => void;
		assignmentTypes: readonly AssignmentType[];
		assignments: readonly DailyAssignment[];
		availabilityEntries: readonly AvailabilityEntry[];
		statusTypes: readonly StatusType[];
		specialDays: readonly SpecialDay[];
		personnelByGroup: readonly GroupData[];
		groups: readonly Group[];
		onSetAssignment: (date: string, typeId: string, assigneeId: string) => Promise<boolean>;
		onSetAssignmentBatch: (assignments: AssignmentWrite[]) => Promise<boolean>;
		/** True while a Quick fill or Clear month write is in flight, so the page can hold navigation. */
		busy?: boolean;
	}

	let {
		currentDate,
		rangeStatus,
		onRetry,
		assignmentTypes,
		assignments,
		availabilityEntries,
		statusTypes,
		specialDays,
		personnelByGroup,
		groups,
		onSetAssignment,
		onSetAssignmentBatch,
		busy = $bindable(false)
	}: Props = $props();

	const monthStart = $derived(new Date(currentDate.getFullYear(), currentDate.getMonth(), 1));
	const monthTitle = $derived(`${getMonthName(monthStart.getMonth())} ${monthStart.getFullYear()}`);
	const monthRange = $derived({
		rangeStart: formatDate(monthStart),
		rangeEnd: formatDate(endOfMonth(monthStart))
	});

	const todayKey = formatDate(new Date());

	const columns = $derived(plannerColumns(assignmentTypes));
	const personnel = $derived(personnelByGroup.flatMap((group) => group.personnel));
	const assignmentsBySlot = $derived(indexAssignmentsBySlot(assignments));
	const availabilityByPerson = $derived(indexDutyAvailability(availabilityEntries));
	const history = $derived(indexDutyHistory(assignments));
	const conflicts = $derived(
		findDutyConflicts({ assignments, assignmentTypes: columns, availabilityByPerson, range: monthRange })
	);
	const table = $derived(
		buildPlannerTable({
			anchor: monthStart,
			todayKey,
			columns,
			assignmentsBySlot,
			conflicts,
			personnel,
			groups,
			specialDays,
			statusTypes
		})
	);

	let fairnessTypeId = $state<string | null>(null);
	const fairnessType = $derived(columns.find((type) => type.id === fairnessTypeId) ?? columns[0]);
	const fairness = $derived(
		fairnessType &&
			dutyFairness({
				type: fairnessType,
				month: monthRange,
				todayKey,
				personnel,
				groups,
				history,
				availabilityByPerson,
				statusTypes
			})
	);

	type PickerTarget = { typeId: string; dateKey: string; anchor: HTMLElement };
	let pickerTarget = $state<PickerTarget | null>(null);
	let clearTypeId = $state<string | null>(null);

	// Changing the month or losing the read window ends whatever was open on the old slots.
	$effect(() => {
		void [monthRange.rangeStart, rangeStatus];
		untrack(() => {
			pickerTarget = null;
			clearTypeId = null;
		});
	});

	const picker = $derived.by(() => {
		if (!pickerTarget || rangeStatus !== 'ready') return null;
		const type = columns.find((candidate) => candidate.id === pickerTarget!.typeId);
		if (!type) return null;
		const { dateKey, anchor } = pickerTarget;
		const current = assignmentsBySlot.get(assignmentSlotKey(dateKey, type.id));
		return {
			type,
			dateKey,
			anchor,
			date: parseDate(dateKey),
			occupied: current !== undefined,
			options: dutyPickerOptions({
				type,
				dateKey,
				personnel,
				groups,
				availabilityByPerson,
				statusTypes,
				history,
				currentAssigneeId: current?.assigneeId
			})
		};
	});

	function openPicker(typeId: string, dateKey: string, anchor: HTMLElement) {
		if (rangeStatus === 'ready' && !busy) pickerTarget = { typeId, dateKey, anchor };
	}

	async function writeBatch(writes: AssignmentWrite[]): Promise<boolean> {
		if (rangeStatus !== 'ready' || busy) return false;
		busy = true;
		try {
			return await onSetAssignmentBatch(writes);
		} finally {
			busy = false;
		}
	}

	async function clearMonth() {
		const type = columns.find((candidate) => candidate.id === clearTypeId);
		if (!type) return;
		const cleared = await writeBatch(
			buildQuickFillBatch({
				anchor: monthStart,
				typeId: type.id,
				assigneeId: '',
				days: 'all',
				onlyOpenDays: false,
				assignmentsBySlot
			})
		);
		if (cleared) clearTypeId = null;
	}

	function scrollToToday(row: HTMLElement) {
		const region = row.closest<HTMLElement>('[data-slot=table-container]');
		const header = region?.querySelector('thead');
		if (region && header) region.scrollTop = Math.max(0, row.offsetTop - header.offsetHeight - row.offsetHeight * 3);
	}

	function cellLabel(column: PlannerColumn, row: PlannerRow, cell: PlannerCell): string {
		const where = `${column.type.name}, ${row.dateLabel}`;
		if (!cell.assignee) return `Assign ${where}`;
		return `${where}: ${cell.assignee.fullName}${cell.conflict ? `, unavailable: ${cell.conflict.availabilityLabel}` : ''}`;
	}
</script>

{#if rangeStatus !== 'ready'}
	<section
		class="flex items-center justify-between gap-3 rounded-lg border bg-card px-5 py-4"
		role="status"
		aria-live="polite"
		aria-busy={rangeStatus === 'loading'}
	>
		{#if rangeStatus === 'error'}
			<p>Assignments for this month could not be loaded.</p>
			<Button variant="outline" size="sm" onclick={onRetry}>Retry calendar load</Button>
		{:else}
			<p>Loading assignments for this month...</p>
		{/if}
	</section>
{:else if table.columns.length === 0}
	<section class="rounded-lg border bg-card px-5 py-6 text-sm text-muted-foreground">
		<p>No duty types are set up yet. Add one in Calendar settings to plan its days.</p>
	</section>
{:else}
	<div class="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
		<div class="overflow-hidden rounded-lg border bg-card">
			<Table.Root
				aria-label="{monthTitle} duty assignments"
				scrollRegionLabel="{monthTitle} duty assignments"
				containerClass="max-h-[calc(100dvh-15rem)] min-h-64 overflow-y-auto"
			>
				<Table.Header class="sticky top-0 z-10 bg-card shadow-[0_1px_0_var(--color-border)]">
					<Table.Row class="bg-muted/40 hover:bg-muted/40">
						<Table.Head scope="col" class="w-40 px-3 font-mono text-xs tracking-widest uppercase">Date</Table.Head>
						{#each table.columns as column (column.type.id)}
							<Table.Head scope="col" class="min-w-44 px-3 py-2">
								<div class="flex items-center gap-2">
									<AssignmentCodeChip code={column.type.shortName} color={column.type.color} size="row" />
									<div class="grid min-w-0 flex-1">
										<span class="truncate text-sm font-semibold">{column.type.name}</span>
										<span class="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
											{column.filledDays} of {column.totalDays} days{column.type.assignTo === 'group'
												? ' · group'
												: ''}{column.type.showOnCalendar ? '' : ' · planner only'}
										</span>
									</div>
									<AssignmentPlannerColumnMenu
										type={column.type}
										choices={eligibleAssignees(column.type, personnel, groups)}
										{busy}
										buildBatch={(assigneeId, days, onlyOpenDays) =>
											buildQuickFillBatch({
												anchor: monthStart,
												typeId: column.type.id,
												assigneeId,
												days,
												onlyOpenDays,
												assignmentsBySlot
											})}
										onApply={writeBatch}
										onClearMonth={() => (clearTypeId = column.type.id)}
									/>
								</div>
							</Table.Head>
						{/each}
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each table.rows as row (row.dateKey)}
						<Table.Row
							class={[
								row.weekend && 'bg-muted/50',
								row.specialDayName && 'bg-warning-muted/60',
								row.today && 'bg-primary/10 shadow-[inset_3px_0_0_var(--color-primary)]',
								row.past && 'opacity-70 focus-within:opacity-100 hover:opacity-100'
							]}
							aria-current={row.today ? 'date' : undefined}
							{@attach row.today ? scrollToToday : undefined}
						>
							<Table.Head scope="row" class="h-auto px-3 py-1.5 font-normal">
								<div class="flex items-baseline gap-2">
									<span class="w-6 text-lg font-semibold tabular-nums">{row.day}</span>
									<span class="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">{row.weekday}</span
									>
									{#if row.today}
										<span class="font-mono text-[10px] font-semibold tracking-wider text-primary uppercase">Today</span>
									{/if}
									{#if row.specialDayName}
										<span class="max-w-24 truncate text-[11px] text-muted-foreground italic" title={row.specialDayName}>
											{row.specialDayName}
										</span>
									{/if}
								</div>
							</Table.Head>
							{#each row.cells as cell, index (cell.typeId)}
								{@const column = table.columns[index]}
								<Table.Cell class={['px-2 py-1', cell.conflict && 'border-l-2 border-l-destructive bg-destructive/10']}>
									<Button
										variant={cell.assignee ? 'ghost' : 'outline'}
										size={cell.assignee ? 'sm' : 'xs'}
										class={[
											cell.assignee
												? 'h-auto min-h-8 w-full justify-start gap-1.5 px-2 py-1 text-left'
												: 'border-dashed text-primary',
											cell.conflict && 'text-destructive-text hover:bg-destructive/15'
										]}
										disabled={busy}
										data-duty-slot={assignmentSlotKey(cell.dateKey, cell.typeId)}
										aria-label={cellLabel(column, row, cell)}
										onclick={(event) => openPicker(cell.typeId, cell.dateKey, event.currentTarget)}
									>
										{#if !cell.assignee}
											<PlusIcon aria-hidden="true" />
											Assign
										{:else}
											{#if cell.conflict}
												<TriangleAlertIcon class="size-3.5 shrink-0" aria-hidden="true" />
											{/if}
											<span class="grid min-w-0">
												<span class="flex items-baseline gap-1.5">
													{#if cell.assignee.prefix}
														<span class="font-mono text-[10px] font-semibold text-muted-foreground uppercase"
															>{cell.assignee.prefix}</span
														>
													{/if}
													<span class="truncate font-medium">{cell.assignee.name}</span>
												</span>
												{#if cell.conflict}
													<span class="truncate font-mono text-[10px] uppercase"
														>On {cell.conflict.availabilityLabel}</span
													>
												{/if}
											</span>
										{/if}
									</Button>
								</Table.Cell>
							{/each}
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</div>

		<div class="grid grid-cols-[minmax(0,1fr)] gap-4">
			<AssignmentConflictsPanel conflicts={table.conflicts} {busy} onFindReplacement={openPicker} />
			{#if fairness}
				<DutyFairnessPanel
					types={columns}
					bind:typeId={() => fairness.type.id, (id) => (fairnessTypeId = id)}
					{fairness}
				/>
			{/if}
		</div>
	</div>
{/if}

{#if picker}
	{#key picker.anchor}
		<DutyPicker
			typeName={picker.type.name}
			assignTo={picker.type.assignTo}
			date={picker.date}
			anchor={picker.anchor}
			returnFocusTo={() =>
				document.querySelector<HTMLElement>(`[data-duty-slot="${assignmentSlotKey(picker.dateKey, picker.type.id)}"]`)}
			options={picker.options}
			onAssign={(assigneeId) => onSetAssignment(picker.dateKey, picker.type.id, assigneeId)}
			onClear={picker.occupied ? () => onSetAssignment(picker.dateKey, picker.type.id, '') : undefined}
			onClose={() => (pickerTarget = null)}
		/>
	{/key}
{/if}

{#if clearTypeId && rangeStatus === 'ready'}
	{@const clearType = columns.find((type) => type.id === clearTypeId)}
	<ConfirmDialog
		title="Clear month"
		message="Clear every {clearType?.name ?? 'duty'} assignment in {monthTitle}?"
		confirmLabel="Clear month"
		variant="default"
		onConfirm={clearMonth}
		onCancel={() => (clearTypeId = null)}
	/>
{/if}
