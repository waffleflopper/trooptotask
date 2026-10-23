<script lang="ts">
	import { untrack } from 'svelte';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
	import type {
		AssignmentType,
		AvailabilityEntry,
		DailyAssignment,
		RosterFillPick,
		RosterFillPreview,
		RosterReplacement,
		SpecialDay,
		StatusType
	} from '$features/calendar/contracts';
	import type { PlannerRosterStatus, RosterDayRead } from '$features/calendar/contexts/PlannerRosterRead.svelte';
	import type { RosterView } from '$features/calendar/utils/plannerRosters';
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
	import { findDutyConflicts, indexDutyAvailability } from '$features/calendar/utils/dutyReadModel';
	import { endOfMonth, formatDate, getMonthName, parseDate } from '$lib/utils/dates';
	import { Button } from '$lib/components/ui/button';
	import { ConfirmDialog } from '$lib/components/ui/confirm-dialog';
	import * as Table from '$lib/components/ui/table';
	import AssignmentCodeChip from './AssignmentCodeChip.svelte';
	import AssignmentConflictsPanel from './AssignmentConflictsPanel.svelte';
	import AssignmentPlannerColumnMenu from './AssignmentPlannerColumnMenu.svelte';
	import DutyPicker from './DutyPicker.svelte';
	import RosterCountPanel from './RosterCountPanel.svelte';
	import RosterReplacementPopover from './RosterReplacementPopover.svelte';

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
		/** Roster counts, for an operator who sees the whole Organization. Absent hides counts and Fill from roster. */
		rosters?: {
			/** The DA 6 page of a roster for a month. */
			da6Href: (typeId: string, month: string) => string;
			status: PlannerRosterStatus;
			stale: boolean;
			views: ReadonlyMap<string, RosterView>;
			onRetry: () => void;
			preview: (typeId: string, from: string, through: string) => Promise<RosterFillPreview>;
			fill: (
				typeId: string,
				from: string,
				through: string,
				picks: RosterFillPick[]
			) => Promise<'saved' | 'changed' | 'failed'>;
			/** Find replacement for a conflicted roster day. Without an assignee the preview takes the rule's pick. */
			replacement: (typeId: string, date: string, assigneeId?: string) => Promise<RosterReplacement>;
			replace: (typeId: string, preview: RosterReplacement) => Promise<'saved' | 'changed' | 'failed'>;
			/** The picker's roster day, read when the picker opens it. */
			day: (typeId: string, date: string) => RosterDayRead | undefined;
			loadDay: (typeId: string, date: string) => void;
			retryDay: (typeId: string, date: string) => void;
		};
		/** A refused roster write's re-read failed, so the month may show a day another operator filled as open. */
		staleAssignments?: { retrying: boolean; onRetry: () => void };
		/** True while a Quick fill, Fill from roster or Clear month write is in flight, so the page can hold navigation. */
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
		rosters,
		staleAssignments,
		busy = $bindable(false)
	}: Props = $props();

	// Nothing assigns while a write is in flight or the month may show a filled day as open.
	const locked = $derived(busy || staleAssignments !== undefined);

	const monthStart = $derived(new Date(currentDate.getFullYear(), currentDate.getMonth(), 1));
	const monthTitle = $derived(`${getMonthName(monthStart.getMonth())} ${monthStart.getFullYear()}`);
	const monthKey = $derived(formatDate(monthStart).slice(0, 7));
	const monthRange = $derived({
		rangeStart: formatDate(monthStart),
		rangeEnd: formatDate(endOfMonth(monthStart))
	});

	const todayKey = formatDate(new Date());

	const columns = $derived(plannerColumns(assignmentTypes));
	const personnel = $derived(personnelByGroup.flatMap((group) => group.personnel));
	const personById = $derived(new Map(personnel.map((person) => [person.id, person])));
	const assignmentsBySlot = $derived(indexAssignmentsBySlot(assignments));
	const blockingStatusIds = $derived(
		new Set(statusTypes.filter((status) => status.rosterEffect !== 'available').map((status) => status.id))
	);
	const availabilityByPerson = $derived(
		indexDutyAvailability(availabilityEntries.filter((entry) => blockingStatusIds.has(entry.statusTypeId)))
	);
	const conflicts = $derived(
		findDutyConflicts({ assignments, assignmentTypes: columns, availabilityByPerson, range: monthRange })
	);
	// A stale view trails the saved availability, so it must not replace the local A, D and U check on the days it covers.
	const rosterViews = $derived(rosters?.status === 'ready' && !rosters.stale ? rosters.views : null);
	const table = $derived(
		buildPlannerTable({
			anchor: monthStart,
			todayKey,
			columns,
			assignmentsBySlot,
			conflicts,
			rosters: rosterViews ?? undefined,
			personnel,
			groups,
			specialDays,
			statusTypes
		})
	);

	const rosterTypes = $derived(columns.filter((type) => type.assignTo === 'personnel'));
	let countTypeId = $state<string | null>(null);
	const countType = $derived(rosterTypes.find((type) => type.id === countTypeId) ?? rosterTypes[0]);

	// The fill may start on any day of the shown month from today on, by default tomorrow.
	const fillDays = $derived(table.rows.map((row) => row.dateKey).filter((dateKey) => dateKey >= todayKey));
	const fillFrom = $derived(fillDays.find((dateKey) => dateKey > todayKey) ?? fillDays[0]);

	function openDays(type: AssignmentType, from: string, through: string) {
		return table.rows.filter(
			(row) =>
				row.dateKey >= from &&
				row.dateKey <= through &&
				!assignmentsBySlot.has(assignmentSlotKey(row.dateKey, type.id)) &&
				!(type.weekendMode === 'none' && (row.weekend || row.specialDayName))
		).length;
	}

	function rosterFillFor(type: AssignmentType) {
		if (!rosters || type.assignTo !== 'personnel' || !fillDays.length) return undefined;
		const { preview, fill } = rosters;
		return {
			days: fillDays,
			defaultFrom: fillFrom,
			personById,
			openDays: (from: string, through: string) => openDays(type, from, through),
			preview: (from: string, through: string) => preview(type.id, from, through),
			commit: async (from: string, through: string, picks: RosterFillPick[]) => {
				if (rangeStatus !== 'ready' || locked) return 'failed' as const;
				busy = true;
				try {
					return await fill(type.id, from, through, picks);
				} finally {
					busy = false;
				}
			}
		};
	}

	/** Someone chosen through the duty picker for a replacement, with what the picker showed about them. */
	type ReplacementPick = { personId: string; count?: number; note?: string };
	type ReplacementTarget = {
		typeId: string;
		dateKey: string;
		anchor: HTMLElement;
		returnTo: HTMLElement;
		picked?: ReplacementPick;
	};
	/** `replacing`: the picker was opened by Someone else, so a pick returns to that replacement instead of saving. */
	type PickerTarget = { typeId: string; dateKey: string; anchor: HTMLElement; replacing?: ReplacementTarget };
	let pickerTarget = $state<PickerTarget | null>(null);
	let replacementTarget = $state<ReplacementTarget | null>(null);
	let clearTypeId = $state<string | null>(null);

	// Changing the month or losing the read window ends whatever was open on the old slots.
	$effect(() => {
		void [monthRange.rangeStart, rangeStatus];
		untrack(() => {
			pickerTarget = null;
			replacementTarget = null;
			clearTypeId = null;
		});
	});

	// The picker reads its roster day when it opens, keyed by the slot alone so a status change never reads it again.
	const pickerDay = $derived.by(() => {
		if (!pickerTarget || !rosters) return null;
		const { typeId, dateKey } = pickerTarget;
		return columns.find((type) => type.id === typeId)?.assignTo === 'personnel' ? `${typeId}|${dateKey}` : null;
	});
	$effect(() => {
		if (!pickerDay) return;
		const [typeId, dateKey] = pickerDay.split('|');
		rosters?.loadDay(typeId, dateKey);
	});

	const picker = $derived.by(() => {
		if (!pickerTarget || rangeStatus !== 'ready') return null;
		const type = columns.find((candidate) => candidate.id === pickerTarget!.typeId);
		if (!type) return null;
		const { dateKey, anchor, replacing } = pickerTarget;
		const current = assignmentsBySlot.get(assignmentSlotKey(dateKey, type.id));
		const counted = rosters && type.assignTo === 'personnel' ? rosters : null;
		const read = counted?.day(type.id, dateKey);
		const options = dutyPickerOptions({
			type,
			dateKey,
			personnel,
			groups,
			availabilityByPerson,
			statusTypes,
			roster: read?.status === 'ready' ? (read.day ?? undefined) : undefined,
			unreadRoster: counted && read?.status !== 'ready' ? (read?.status ?? 'loading') : undefined,
			currentAssigneeId: replacing ? replacing.picked?.personId : current?.assigneeId
		});
		return {
			type,
			dateKey,
			anchor,
			replacing,
			date: parseDate(dateKey),
			occupied: current !== undefined && !replacing,
			counts: counted
				? {
						status: read?.status ?? 'loading',
						stale: read?.status === 'ready' && read.stale === true,
						onRetry: () => counted.retryDay(type.id, dateKey)
					}
				: undefined,
			// The person being replaced is not a replacement.
			options: replacing ? options.filter((option) => option.id !== current?.assigneeId) : options
		};
	});

	function openPicker(typeId: string, dateKey: string, anchor: HTMLElement, replacing?: ReplacementTarget) {
		if (rangeStatus === 'ready' && !locked) pickerTarget = { typeId, dateKey, anchor, replacing };
	}

	async function assignFromPicker(assigneeId: string): Promise<boolean> {
		if (!picker) return false;
		const { replacing, dateKey, type } = picker;
		if (!replacing) return onSetAssignment(dateKey, type.id, assigneeId);
		const option = picker.options.find((candidate) => candidate.id === assigneeId);
		const note =
			option?.kind !== 'personnel'
				? undefined
				: (option.unavailable ?? (option.offRoster ? 'Not on this roster' : undefined));
		pickerTarget = null;
		replacementTarget = {
			...replacing,
			picked: { personId: assigneeId, count: option?.kind === 'personnel' ? option.count : undefined, note }
		};
		return true;
	}

	// Closing a picker opened by Someone else goes back to the replacement as it was.
	function closePicker() {
		if (pickerTarget?.replacing) replacementTarget = pickerTarget.replacing;
		pickerTarget = null;
	}

	const slotCell = (typeId: string, dateKey: string) =>
		document.querySelector<HTMLElement>(`[data-duty-slot="${assignmentSlotKey(dateKey, typeId)}"]`);

	// A roster day's conflict opens the replacement beside its cell. Any other conflict opens the duty picker.
	function findReplacement(typeId: string, dateKey: string, button: HTMLElement) {
		if (rangeStatus !== 'ready' || locked) return;
		const cell = slotCell(typeId, dateKey);
		if (!rosters || !rosterViews?.get(typeId)?.covered.has(dateKey) || !cell)
			return openPicker(typeId, dateKey, button);
		cell.scrollIntoView({ block: 'nearest', inline: 'nearest' });
		replacementTarget = { typeId, dateKey, anchor: cell, returnTo: button };
	}

	const replacement = $derived.by(() => {
		if (!replacementTarget || !rosters || rangeStatus !== 'ready') return null;
		const { typeId, dateKey } = replacementTarget;
		const type = columns.find((candidate) => candidate.id === typeId);
		const current = assignmentsBySlot.get(assignmentSlotKey(dateKey, typeId));
		if (!type) return null;
		const { replacement: load, replace } = rosters;
		return {
			...replacementTarget,
			type,
			assignee: current ? personById.get(current.assigneeId) : undefined,
			load: (assigneeId?: string) => load(typeId, dateKey, assigneeId),
			commit: async (preview: RosterReplacement) => {
				if (locked) return 'failed' as const;
				busy = true;
				try {
					return await replace(typeId, preview);
				} finally {
					busy = false;
					// A refused replacement whose re-read failed locks the month, and the banner says why.
					if (staleAssignments) replacementTarget = null;
				}
			}
		};
	});

	async function writeBatch(writes: AssignmentWrite[]): Promise<boolean> {
		if (rangeStatus !== 'ready' || locked) return false;
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
		return `${where}: ${cell.assignee.fullName}${cell.conflict ? `, unavailable: ${cell.conflict.reason}` : ''}`;
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
	{#if staleAssignments}
		<section class="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card px-5 py-4" role="alert">
			<p>The roster changed, and this month's assignments could not be read again. Assigning waits until they load.</p>
			<Button
				variant="outline"
				size="sm"
				disabled={staleAssignments.retrying}
				aria-busy={staleAssignments.retrying}
				onclick={staleAssignments.onRetry}>Retry</Button
			>
		</section>
	{/if}
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
								<!-- The column menu's buttons fill the last column, the actions beside the name and Fill beside the count. -->
								<div class="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-0.5">
									<div class="row-span-2 flex">
										<AssignmentCodeChip code={column.type.shortName} color={column.type.color} size="row" />
									</div>
									<span class="truncate text-sm font-semibold" title={column.type.name}>{column.type.name}</span>
									<span
										class="col-start-2 row-start-2 truncate font-mono text-[10px] tracking-wider text-muted-foreground uppercase"
									>
										{column.filledDays} of {column.totalDays} days{column.type.assignTo === 'group'
											? ' · group'
											: ''}{column.type.showOnCalendar ? '' : ' · planner only'}
									</span>
									<AssignmentPlannerColumnMenu
										type={column.type}
										choices={eligibleAssignees(column.type, personnel, groups)}
										busy={locked}
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
										rosterFill={rosterFillFor(column.type)}
										da6Href={rosters && column.type.assignTo === 'personnel'
											? rosters.da6Href(column.type.id, monthKey)
											: undefined}
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
										disabled={locked}
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
													<span class="truncate font-mono text-[10px] uppercase">On {cell.conflict.reason}</span>
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
			<AssignmentConflictsPanel conflicts={table.conflicts} busy={locked} onFindReplacement={findReplacement} />
			{#if rosters && countType}
				<RosterCountPanel
					types={rosterTypes}
					bind:typeId={() => countType.id, (id) => (countTypeId = id)}
					status={rosters.status}
					stale={rosters.stale}
					roster={rosters.views.get(countType.id)}
					{personById}
					da6Href={rosters.da6Href(countType.id, monthKey)}
					onRetry={rosters.onRetry}
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
			counts={picker.counts}
			onAssign={assignFromPicker}
			onClear={picker.occupied ? () => onSetAssignment(picker.dateKey, picker.type.id, '') : undefined}
			replacing={picker.replacing !== undefined}
			onClose={closePicker}
		/>
	{/key}
{/if}

{#if replacement}
	{#key replacement.anchor}
		<RosterReplacementPopover
			typeName={replacement.type.name}
			dateKey={replacement.dateKey}
			anchor={replacement.anchor}
			returnFocusTo={() =>
				replacement.returnTo.isConnected ? replacement.returnTo : slotCell(replacement.type.id, replacement.dateKey)}
			assignee={replacement.assignee}
			picked={replacement.picked}
			{personById}
			load={replacement.load}
			commit={replacement.commit}
			onSomeoneElse={() => {
				const { type, dateKey, anchor } = replacement;
				const target = replacementTarget;
				replacementTarget = null;
				if (target) openPicker(type.id, dateKey, anchor, target);
			}}
			onClose={() => (replacementTarget = null)}
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
