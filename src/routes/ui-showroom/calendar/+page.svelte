<script lang="ts">
	import { resolve } from '$app/paths';
	import BellIcon from '@lucide/svelte/icons/bell';
	import CalendarIcon from '@lucide/svelte/icons/calendar-days';
	import ChevronLeftIcon from '@lucide/svelte/icons/chevron-left';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import FileSpreadsheetIcon from '@lucide/svelte/icons/file-spreadsheet';
	import PrinterIcon from '@lucide/svelte/icons/printer';
	import { SvelteMap } from 'svelte/reactivity';
	import OrgNavIcon from '$lib/components/OrgNavIcon.svelte';
	import * as AppDialog from '$lib/components/ui/app-dialog';
	import { Button } from '$lib/components/ui/button';
	import { CalendarStatusBadge } from '$lib/components/ui/calendar-status-badge';
	import * as OperationalMatrix from '$lib/components/ui/operational-matrix';
	import { Separator } from '$lib/components/ui/separator';
	import * as Sidebar from '$lib/components/ui/sidebar';
	import type {
		OperationalMatrixCellSelection,
		OperationalMatrixColumn,
		OperationalMatrixRow,
		OperationalMatrixRowGroup
	} from '$lib/components/ui/operational-matrix';

	type CalendarStatus = 'leave' | 'school' | 'field' | 'tdy' | 'appointment' | 'sick' | 'cqsd' | 'sick-call';
	type ViewMode = 'month' | 'long-range';
	type ShellNavIcon =
		| 'dashboard'
		| 'calendar'
		| 'personnel'
		| 'rating-scheme'
		| 'training'
		| 'critical-tasks'
		| 'onboarding';

	interface PersonnelRow extends OperationalMatrixRow {
		rank: string;
		firstName: string;
		lastName: string;
		groupId: string;
		groupLabel: string;
		badge?: string;
	}

	interface CalendarColumn extends OperationalMatrixColumn {
		date: Date;
		dateKey: string;
		day: number;
		dayName: string;
		monthLabel: string;
		monthKey: string;
		monthIndex: number;
		isToday: boolean;
		isWeekend: boolean;
		isHoliday: boolean;
	}

	interface StatusBlock {
		rowId: string;
		start: string;
		end: string;
		status: CalendarStatus;
		note?: string;
		dutyLabel?: string;
	}

	interface DailyDuty {
		date: string;
		title: string;
		assignee: string;
		detail: string;
	}

	interface CellDialogState {
		row: PersonnelRow;
		column: CalendarColumn;
		status?: StatusBlock;
	}

	interface DateDialogState {
		column: CalendarColumn;
		duties: DailyDuty[];
	}

	const statusLegend: Record<
		CalendarStatus,
		{ label: string; short: string; color: string; textColor: string; denseLabel: string }
	> = {
		leave: {
			label: 'Leave',
			short: 'LEAVE',
			color: '#48bd76',
			textColor: '#f8fff9',
			denseLabel: 'Leave'
		},
		school: {
			label: 'School',
			short: 'SCHOOL',
			color: '#469be0',
			textColor: '#f8fbff',
			denseLabel: 'School'
		},
		field: {
			label: 'Field/Training',
			short: 'FIELD',
			color: '#a9562b',
			textColor: '#fff7ef',
			denseLabel: 'Field'
		},
		tdy: {
			label: 'TDY',
			short: 'TDY',
			color: '#9b72e8',
			textColor: '#fbf8ff',
			denseLabel: 'TDY'
		},
		appointment: {
			label: 'Appointment',
			short: 'APPOI...',
			color: '#f28a31',
			textColor: '#fff9f2',
			denseLabel: 'Appointment'
		},
		sick: {
			label: 'Sick',
			short: 'SICK ...',
			color: '#e62b2d',
			textColor: '#fff8f8',
			denseLabel: 'Sick'
		},
		cqsd: {
			label: 'CQ/SD',
			short: 'CQ/SD',
			color: '#d82028',
			textColor: '#fff8f8',
			denseLabel: 'CQ/SD'
		},
		'sick-call': {
			label: 'Sick Call',
			short: 'SICK CALL',
			color: '#e32b2f',
			textColor: '#fff8f8',
			denseLabel: 'Sick call'
		}
	};

	const shellNavItems: Array<{ id: string; label: string; icon: ShellNavIcon; active?: boolean }> = [
		{ id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
		{ id: 'calendar', label: 'Calendar', icon: 'calendar', active: true },
		{ id: 'personnel', label: 'Personnel', icon: 'personnel' },
		{ id: 'evals', label: 'Evals', icon: 'rating-scheme' },
		{ id: 'training', label: 'Training', icon: 'training' },
		{ id: 'critical-tasks', label: 'Critical Tasks', icon: 'critical-tasks' },
		{ id: 'onboarding', label: 'Onboarding', icon: 'onboarding' }
	];

	const personnelRows: PersonnelRow[] = [
		row('caleb', '1LT', 'Caleb', 'Dawson', '1st Platoon'),
		row('nadia', 'SFC', 'Nadia', 'Powell', '1st Platoon'),
		row('leah', 'SSG', 'Leah', 'Griffin', '1st Platoon'),
		row('isaac', 'SSG', 'Isaac', 'Navarro', '1st Platoon'),
		row('owen', 'SSG', 'Owen', 'Turner', '1st Platoon'),
		row('nora', 'SGT', 'Nora', 'Fletcher', '1st Platoon'),
		row('amelia', 'SGT', 'Amelia', 'Hughes', '1st Platoon'),
		row('ryan', 'SGT', 'Ryan', 'Simmons', '1st Platoon'),
		row('dylan', 'CPL', 'Dylan', 'Watts', '1st Platoon'),
		row('iris', 'SPC', 'Iris', 'Coleman', '1st Platoon', 'ETS'),
		row('grace', 'SPC', 'Grace', 'Ellis', '1st Platoon'),
		row('cole', 'SPC', 'Cole', 'Ramsey', '1st Platoon'),
		row('miles', 'SPC', 'Miles', 'Stone', '1st Platoon'),
		row('lily', 'SPC', 'Lily', 'Vega', '1st Platoon'),
		row('zoe', 'PFC', 'Zoe', 'Fisher', '1st Platoon'),
		row('wyatt', 'PFC', 'Wyatt', 'Long', '1st Platoon'),
		row('mason', 'PFC', 'Mason', 'Murphy', '1st Platoon'),
		row('june', 'PV2', 'June', 'Bryant', '1st Platoon'),
		row('tessa', '2LT', 'Tessa', 'Holland', '2nd Platoon'),
		row('omar', 'SFC', 'Omar', 'Fleming', '2nd Platoon'),
		row('mateo', 'SSG', 'Mateo', 'Ortega', '2nd Platoon'),
		row('elsa', 'SSG', 'Elsa', 'Park', '2nd Platoon'),
		row('mina', 'SSG', 'Mina', 'Silva', '2nd Platoon'),
		row('andre', 'SGT', 'Andre', 'Banks', '2nd Platoon'),
		row('hannah', 'SGT', 'Hannah', 'Reed', '2nd Platoon')
	];

	const statusBlocks: StatusBlock[] = [
		block('caleb', '2026-05-24', '2026-05-31', 'school'),
		block('leah', '2026-05-01', '2026-05-02', 'school'),
		block('nora', '2026-05-03', '2026-05-09', 'leave'),
		block('nora', '2026-05-28', '2026-05-28', 'sick', 'Sick call follow-up'),
		block('amelia', '2026-05-09', '2026-05-16', 'school'),
		block('ryan', '2026-05-07', '2026-05-20', 'school'),
		block('ryan', '2026-05-13', '2026-05-13', 'appointment'),
		block('dylan', '2026-05-01', '2026-05-03', 'leave'),
		block('dylan', '2026-05-22', '2026-05-22', 'sick'),
		block('iris', '2026-05-11', '2026-05-22', 'school'),
		block('lily', '2026-05-28', '2026-05-28', 'appointment'),
		block('mason', '2026-05-25', '2026-05-30', 'leave'),
		block('tessa', '2026-05-01', '2026-05-05', 'field'),
		block('omar', '2026-05-01', '2026-05-05', 'field'),
		block('omar', '2026-05-16', '2026-05-23', 'tdy'),
		block('mateo', '2026-05-01', '2026-05-05', 'field'),
		block('mateo', '2026-05-04', '2026-05-04', 'appointment'),
		block('elsa', '2026-05-15', '2026-05-15', 'sick'),
		block('mina', '2026-05-18', '2026-05-22', 'leave'),
		block('andre', '2026-05-06', '2026-05-14', 'school'),
		block('caleb', '2026-06-01', '2026-06-06', 'school'),
		block('owen', '2026-06-02', '2026-06-07', 'school'),
		block('dylan', '2026-06-10', '2026-06-10', 'sick'),
		block('iris', '2026-06-20', '2026-06-20', 'appointment'),
		block('mason', '2026-06-05', '2026-06-10', 'leave'),
		block('andre', '2026-06-01', '2026-06-05', 'school'),
		block('amelia', '2026-07-06', '2026-07-17', 'school'),
		block('nora', '2026-07-20', '2026-07-24', 'leave'),
		block('omar', '2026-07-08', '2026-07-14', 'field'),
		block('mina', '2026-07-01', '2026-07-05', 'leave')
	];

	const dutyMarkers: StatusBlock[] = [
		block('dylan', '2026-05-09', '2026-05-09', 'cqsd', undefined, 'BSD'),
		block('iris', '2026-05-05', '2026-05-05', 'cqsd', undefined, 'BSD'),
		block('ryan', '2026-05-13', '2026-05-13', 'appointment'),
		block('june', '2026-05-05', '2026-05-05', 'cqsd', undefined, 'SD'),
		block('caleb', '2026-06-03', '2026-06-03', 'cqsd', undefined, 'CQ')
	];

	const dailyDuties: DailyDuty[] = [
		{ date: '2026-05-08', title: 'Battalion staff duty', assignee: 'SGT Simmons', detail: '1800 handoff' },
		{ date: '2026-05-08', title: 'CQ runner', assignee: 'CPL Watts', detail: 'Main building' },
		{ date: '2026-05-09', title: 'Brigade support detail', assignee: 'CPL Watts', detail: 'BSD badge on roster' },
		{ date: '2026-05-25', title: 'Memorial Day coverage', assignee: 'SFC Powell', detail: 'Reduced footprint' },
		{ date: '2026-06-10', title: 'Range detail', assignee: 'SSG Turner', detail: 'Ammo draw at 0530' }
	];

	let viewMode = $state<ViewMode>('month');
	let anchorMonth = $state(new Date(2026, 4, 1));
	let selectedCell = $state<{ rowId: string; columnId: string } | undefined>({
		rowId: 'ryan',
		columnId: '2026-05-08'
	});
	let cellDialog = $state<CellDialogState | undefined>();
	let dateDialog = $state<DateDialogState | undefined>();

	const visibleMonths = $derived.by(() => {
		const count = viewMode === 'long-range' ? 3 : 1;
		return Array.from({ length: count }, (_, index) => addMonths(anchorMonth, index));
	});

	const columns = $derived.by(() => visibleMonths.flatMap((month, index) => buildMonthColumns(month, index)));
	const rowGroups = $derived.by<OperationalMatrixRowGroup[]>(() => {
		const groups = new SvelteMap<string, PersonnelRow[]>();
		for (const person of personnelRows) {
			const groupRows = groups.get(person.groupId) ?? [];
			groupRows.push(person);
			groups.set(person.groupId, groupRows);
		}

		return Array.from(groups.entries()).map(([id, rows]) => ({
			id,
			label: rows[0]?.groupLabel ?? id,
			rowIds: rows.map((person) => person.id)
		}));
	});

	const title = $derived.by(() => {
		if (viewMode === 'month') {
			return formatMonthYear(anchorMonth);
		}

		const end = addMonths(anchorMonth, 2);
		return `${formatMonthYear(anchorMonth)} - ${formatMonthYear(end)}`;
	});

	const displayRows = $derived.by(() => {
		const rows: Array<{ type: 'group'; group: OperationalMatrixRowGroup } | { type: 'person'; row: PersonnelRow }> = [];

		for (const group of rowGroups) {
			rows.push({ type: 'group', group });
			for (const rowId of group.rowIds) {
				const person = personnelRows.find((candidate) => candidate.id === rowId);
				if (person) rows.push({ type: 'person', row: person });
			}
		}

		return rows;
	});

	function row(
		id: string,
		rank: string,
		firstName: string,
		lastName: string,
		groupLabel: string,
		badge?: string
	): PersonnelRow {
		const groupId = groupLabel.toLowerCase().replaceAll(' ', '-');
		return {
			id,
			label: `${rank} ${lastName}, ${firstName}`,
			rank,
			firstName,
			lastName,
			groupId,
			groupLabel,
			badge
		};
	}

	function block(
		rowId: string,
		start: string,
		end: string,
		status: CalendarStatus,
		note?: string,
		dutyLabel?: string
	): StatusBlock {
		return { rowId, start, end, status, note, dutyLabel };
	}

	function pad(value: number) {
		return value.toString().padStart(2, '0');
	}

	function dateKey(date: Date) {
		return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
	}

	function addMonths(date: Date, offset: number) {
		return new Date(date.getFullYear(), date.getMonth() + offset, 1);
	}

	function daysInMonth(date: Date) {
		return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
	}

	function buildMonthColumns(date: Date, monthIndex: number): CalendarColumn[] {
		const formatter = new Intl.DateTimeFormat('en-US', { weekday: 'short' });
		const monthLabel = formatMonthYear(date);
		const monthKey = `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;

		return Array.from({ length: daysInMonth(date) }, (_, index) => {
			const day = index + 1;
			const current = new Date(date.getFullYear(), date.getMonth(), day);
			const key = dateKey(current);
			const dayName = formatter.format(current).toUpperCase();

			return {
				id: key,
				label: `${dayName} ${day}`,
				date: current,
				dateKey: key,
				day,
				dayName,
				monthLabel,
				monthKey,
				monthIndex,
				isToday: key === '2026-05-08',
				isWeekend: current.getDay() === 0 || current.getDay() === 6,
				isHoliday: key === '2026-05-25'
			};
		});
	}

	function formatMonthYear(date: Date) {
		return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(date);
	}

	function getStatus(rowId: string, columnId: string) {
		return statusBlocks.find((status) => status.rowId === rowId && columnId >= status.start && columnId <= status.end);
	}

	function getDutyMarker(rowId: string, columnId: string) {
		return dutyMarkers.find((status) => status.rowId === rowId && columnId >= status.start && columnId <= status.end);
	}

	function monthGroups() {
		const groups: { key: string; label: string; span: number }[] = [];

		for (const column of columns) {
			const existing = groups.find((group) => group.key === column.monthKey);
			if (existing) {
				existing.span += 1;
			} else {
				groups.push({ key: column.monthKey, label: column.monthLabel, span: 1 });
			}
		}

		return groups;
	}

	function dutiesForDate(column: CalendarColumn) {
		return dailyDuties.filter((duty) => duty.date === column.dateKey);
	}

	function moveMonth(offset: number) {
		anchorMonth = addMonths(anchorMonth, viewMode === 'long-range' ? offset * 3 : offset);
	}

	function goToday() {
		anchorMonth = new Date(2026, 4, 1);
	}

	function toggleViewMode() {
		viewMode = viewMode === 'month' ? 'long-range' : 'month';
	}

	function handleCellSelect(selection: OperationalMatrixCellSelection) {
		const row = selection.row as PersonnelRow;
		const column = selection.column as CalendarColumn;
		selectedCell = { rowId: row.id, columnId: column.id };
		cellDialog = {
			row,
			column,
			status: getStatus(row.id, column.id)
		};
	}

	function openDateDialog(column: CalendarColumn) {
		dateDialog = {
			column,
			duties: dutiesForDate(column)
		};
	}

	function closeCellDialog() {
		cellDialog = undefined;
	}

	function closeDateDialog() {
		dateDialog = undefined;
	}
</script>

<svelte:head>
	<title>Calendar Matrix Showroom</title>
</svelte:head>

<Sidebar.Provider class="h-svh min-h-0 bg-background font-sans">
	<Sidebar.Root collapsible="icon">
		<Sidebar.Header>
			<Sidebar.Menu>
				<Sidebar.MenuItem>
					<Sidebar.MenuButton size="lg" tooltipContent="1-23 Infantry">
						<span
							class="flex aspect-square size-8 shrink-0 items-center justify-center rounded-md bg-sidebar-accent text-xs font-semibold text-sidebar-accent-foreground"
						>
							1-23
						</span>
						<span class="grid flex-1 text-left text-sm leading-tight">
							<span class="truncate font-medium">1-23 Infantry</span>
							<span class="truncate text-xs">Admin</span>
						</span>
					</Sidebar.MenuButton>
				</Sidebar.MenuItem>
			</Sidebar.Menu>
		</Sidebar.Header>

		<Sidebar.Content>
			<Sidebar.Group>
				<Sidebar.GroupLabel>Navigation</Sidebar.GroupLabel>
				<Sidebar.GroupContent>
					<Sidebar.Menu>
						{#each shellNavItems as item (item.id)}
							<Sidebar.MenuItem>
								<Sidebar.MenuButton isActive={item.active} tooltipContent={item.label}>
									{#snippet child({ props })}
										<a {...props} href={resolve('/ui-showroom/calendar')}>
											<OrgNavIcon icon={item.icon} />
											<span>{item.label}</span>
										</a>
									{/snippet}
								</Sidebar.MenuButton>
							</Sidebar.MenuItem>
						{/each}
					</Sidebar.Menu>
				</Sidebar.GroupContent>
			</Sidebar.Group>
		</Sidebar.Content>

		<Sidebar.Footer>
			<Sidebar.Menu>
				<Sidebar.MenuItem>
					<Sidebar.MenuButton size="lg" tooltipContent="CPT Avery Brooks">
						<span
							class="flex aspect-square size-8 items-center justify-center rounded-md border bg-muted text-sm font-medium"
						>
							AB
						</span>
						<span class="grid flex-1 text-left text-sm leading-tight">
							<span class="truncate font-medium">CPT Avery Brooks</span>
							<span class="truncate text-xs">avery.brooks@example.mil</span>
						</span>
					</Sidebar.MenuButton>
				</Sidebar.MenuItem>
			</Sidebar.Menu>
		</Sidebar.Footer>
		<Sidebar.Rail />
	</Sidebar.Root>

	<Sidebar.Inset>
		<header class="flex h-14 shrink-0 items-center gap-2 border-b bg-background px-4">
			<Sidebar.Trigger />
			<Separator orientation="vertical" class="h-4" />
			<div class="grid min-w-0 flex-1 leading-tight">
				<span class="truncate text-sm font-medium">1-23 Infantry</span>
				<span class="hidden truncate text-xs text-muted-foreground sm:block">Calendar matrix showroom</span>
			</div>
			<div class="ml-auto">
				<Button variant="outline" size="icon" class="size-8" aria-label="Notifications">
					<BellIcon aria-hidden="true" class="size-4" />
				</Button>
			</div>
		</header>

		<div
			class="calendar-page flex min-h-0 flex-1 flex-col overflow-hidden bg-background p-3 text-foreground"
			data-view-mode={viewMode}
			style="--calendar-day-width: {viewMode === 'long-range' ? '18px' : '28px'}; --calendar-row-height: {viewMode ===
			'long-range'
				? '24px'
				: '32px'}; --calendar-personnel-width: {viewMode === 'long-range'
				? '190px'
				: '210px'}; --calendar-column-count: {columns.length};"
		>
			<section
				class="calendar-shell flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-border bg-card"
			>
				<div class="calendar-toolbar flex shrink-0 items-center gap-3 border-b border-border bg-card px-5 py-3">
					<Button variant="outline" size="sm" class="h-9 gap-1.5 rounded px-3" onclick={() => moveMonth(-1)}>
						<ChevronLeftIcon aria-hidden="true" class="size-4" />
						{viewMode === 'long-range' ? 'Prev 3 Months' : 'Prev'}
					</Button>

					<h1 class="min-w-0 shrink-0 px-3 font-serif text-3xl leading-none font-bold tracking-normal text-foreground">
						{title}
					</h1>

					<Button variant="outline" size="sm" class="h-9 gap-1.5 rounded px-3" onclick={() => moveMonth(1)}>
						{viewMode === 'long-range' ? 'Next 3 Months' : 'Next'}
						<ChevronRightIcon aria-hidden="true" class="size-4" />
					</Button>

					<div class="ml-auto flex items-center gap-2">
						<Button variant="outline" size="sm" class="h-9 rounded px-3" onclick={toggleViewMode}>
							<CalendarIcon aria-hidden="true" class="size-4" />
							{viewMode === 'long-range' ? 'Month' : '3-Month'}
						</Button>
						<Button size="sm" class="h-9 rounded px-3" onclick={goToday}>Today</Button>
					</div>
				</div>

				<OperationalMatrix.Root
					rows={personnelRows}
					{columns}
					{rowGroups}
					{selectedCell}
					onCellSelect={handleCellSelect}
					class="calendar-matrix-root flex min-h-0 flex-1 flex-col"
				>
					<OperationalMatrix.Viewport
						ariaLabel="Scrollable operational calendar matrix"
						class="calendar-viewport min-h-0 flex-1 overflow-auto"
					>
						<OperationalMatrix.Table ariaLabel="Operational calendar matrix" class="calendar-matrix-table table-fixed">
							<colgroup>
								<col style="width: var(--calendar-personnel-width);" />
								{#each columns as column (column.id)}
									<col style="width: var(--calendar-day-width);" />
								{/each}
							</colgroup>
							<OperationalMatrix.Header>
								{#if viewMode === 'long-range'}
									<OperationalMatrix.HeaderRow>
										<OperationalMatrix.CornerCell class="calendar-corner calendar-corner-month">
											Personnel
										</OperationalMatrix.CornerCell>
										{#each monthGroups() as group (group.key)}
											<OperationalMatrix.ColumnGroup
												columnSpan={group.span}
												label={group.label}
												class="calendar-month-band"
											>
												{group.label.toUpperCase()}
											</OperationalMatrix.ColumnGroup>
										{/each}
									</OperationalMatrix.HeaderRow>
								{/if}

								<OperationalMatrix.HeaderRow>
									{#if viewMode === 'month'}
										<OperationalMatrix.CornerCell class="calendar-corner">Personnel</OperationalMatrix.CornerCell>
									{:else}
										<OperationalMatrix.CornerCell class="calendar-corner calendar-corner-days"
										></OperationalMatrix.CornerCell>
									{/if}

									{#each columns as column (column.id)}
										<OperationalMatrix.ColumnHeader
											{column}
											class={[
												'calendar-date-header',
												column.isToday && 'is-today',
												column.isWeekend && 'is-weekend',
												column.isHoliday && 'is-holiday'
											]}
										>
											<Button
												type="button"
												variant="ghost"
												class="date-header-button"
												aria-label="Open duties for {column.monthLabel} {column.day}"
												onclick={() => openDateDialog(column)}
											>
												{#if viewMode === 'month'}
													<span class="date-weekday">{column.dayName}</span>
												{/if}
												<span class="date-number">{column.day}</span>
											</Button>
										</OperationalMatrix.ColumnHeader>
									{/each}
								</OperationalMatrix.HeaderRow>
							</OperationalMatrix.Header>

							<OperationalMatrix.Body>
								{#each displayRows as displayRow (displayRow.type === 'group' ? displayRow.group.id : displayRow.row.id)}
									{#if displayRow.type === 'group'}
										<OperationalMatrix.RowGroup
											group={displayRow.group}
											columnSpan={columns.length + 1}
											class="calendar-group-row"
										>
											<span class="group-toggle" aria-hidden="true">▼</span>
											<span>{displayRow.group.label}</span>
											<span class="group-pin">PIN</span>
										</OperationalMatrix.RowGroup>
									{:else}
										<OperationalMatrix.Row row={displayRow.row} class="calendar-person-row">
											<OperationalMatrix.RowHeader row={displayRow.row} sticky class="calendar-person-header">
												<span class="person-rank">{displayRow.row.rank}</span>
												<span class="person-name">
													{viewMode === 'long-range'
														? displayRow.row.lastName
														: `${displayRow.row.lastName}, ${displayRow.row.firstName}`}
												</span>
												{#if displayRow.row.badge && viewMode === 'month'}
													<span class="person-badge">{displayRow.row.badge}</span>
												{/if}
											</OperationalMatrix.RowHeader>
											{#each columns as column (column.id)}
												{@const status = getStatus(displayRow.row.id, column.id)}
												{@const dutyMarker = getDutyMarker(displayRow.row.id, column.id)}
												<OperationalMatrix.Cell
													row={displayRow.row}
													{column}
													ariaLabel="{displayRow.row.label}, {column.monthLabel} {column.day}"
													class={[
														'calendar-status-cell',
														column.isToday && 'is-today',
														column.isWeekend && 'is-weekend',
														column.isHoliday && 'is-holiday',
														status && 'has-status',
														dutyMarker && 'has-duty-marker'
													]}
												>
													{#if status}
														{@const config = statusLegend[status.status]}
														<span
															class="status-fill"
															style="background-color: {config.color}; color: {config.textColor};"
															title="{config.label}{status.note ? `: ${status.note}` : ''}"
														>
															{#if viewMode === 'month'}
																{config.short}
															{/if}
														</span>
													{:else}
														<span class="empty-fill"></span>
													{/if}

													{#if dutyMarker}
														{@const dutyConfig = statusLegend[dutyMarker.status]}
														<span
															class="duty-marker"
															style="background-color: {dutyConfig.color}; color: {dutyConfig.textColor};"
														>
															{dutyMarker.dutyLabel ?? dutyConfig.short}
														</span>
													{/if}
												</OperationalMatrix.Cell>
											{/each}
										</OperationalMatrix.Row>
									{/if}
								{/each}
							</OperationalMatrix.Body>
						</OperationalMatrix.Table>
					</OperationalMatrix.Viewport>
				</OperationalMatrix.Root>

				<div
					class="calendar-footer flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border bg-card px-5 py-2"
				>
					<div class="legend flex flex-wrap items-center gap-2">
						{#if viewMode === 'long-range'}
							<span class="legend-title">Status:</span>
						{/if}
						{#each Object.entries(statusLegend).filter(([key]) => key !== 'cqsd') as [key, config] (key)}
							<CalendarStatusBadge
								statusType={{
									id: key,
									name: config.label,
									color: config.color,
									textColor: config.textColor
								}}
							>
								{config.label}
							</CalendarStatusBadge>
						{/each}
					</div>

					{#if viewMode === 'long-range'}
						<div class="flex items-center gap-2">
							<Button variant="outline" size="sm" class="h-9 rounded px-3">
								<FileSpreadsheetIcon aria-hidden="true" class="size-4" />
								Excel
							</Button>
							<Button variant="outline" size="sm" class="h-9 rounded px-3">
								<PrinterIcon aria-hidden="true" class="size-4" />
								PDF
							</Button>
						</div>
					{/if}
				</div>
			</section>
		</div>
	</Sidebar.Inset>
</Sidebar.Provider>

{#if cellDialog}
	<AppDialog.Root open onClose={closeCellDialog}>
		<AppDialog.Content>
			<AppDialog.Header>
				<AppDialog.Title>Add Status</AppDialog.Title>
				<AppDialog.Description>
					{cellDialog.row.rank}
					{cellDialog.row.lastName}, {cellDialog.row.firstName} on {cellDialog.column.monthLabel}
					{cellDialog.column.day}
				</AppDialog.Description>
			</AppDialog.Header>
			<AppDialog.Body>
				<div class="space-y-4 text-sm">
					<p class="text-muted-foreground">
						This showroom dialog is wrapper-owned. The matrix only emitted row and date identity.
					</p>
					<div class="rounded-md border bg-muted/30 p-3">
						<div class="font-mono text-xs tracking-widest text-muted-foreground uppercase">Current status</div>
						<div class="mt-1 font-medium">
							{cellDialog.status ? statusLegend[cellDialog.status.status].label : 'No status recorded'}
						</div>
					</div>
					<div class="grid gap-2 sm:grid-cols-2">
						{#each Object.entries(statusLegend).filter(([key]) => key !== 'cqsd') as [key, config] (key)}
							<Button
								type="button"
								variant="outline"
								class="flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-left hover:bg-muted"
							>
								<span class="size-3 rounded-[2px]" style="background-color: {config.color};"></span>
								<span>{config.label}</span>
							</Button>
						{/each}
					</div>
				</div>
			</AppDialog.Body>
			<AppDialog.Footer>
				<Button variant="outline" onclick={closeCellDialog}>Cancel</Button>
				<Button onclick={closeCellDialog}>Save status</Button>
			</AppDialog.Footer>
		</AppDialog.Content>
	</AppDialog.Root>
{/if}

{#if dateDialog}
	<AppDialog.Root open onClose={closeDateDialog}>
		<AppDialog.Content>
			<AppDialog.Header>
				<AppDialog.Title>Daily Duties</AppDialog.Title>
				<AppDialog.Description>
					{dateDialog.column.monthLabel}
					{dateDialog.column.day}
				</AppDialog.Description>
			</AppDialog.Header>
			<AppDialog.Body>
				{#if dateDialog.duties.length > 0}
					<div class="divide-y rounded-md border">
						{#each dateDialog.duties as duty (`${duty.date}-${duty.title}`)}
							<div class="p-3">
								<div class="font-medium">{duty.title}</div>
								<div class="text-sm text-muted-foreground">{duty.assignee}</div>
								<div class="mt-1 text-sm">{duty.detail}</div>
							</div>
						{/each}
					</div>
				{:else}
					<div class="rounded-md border bg-muted/30 p-4 text-sm text-muted-foreground">
						No duties assigned for this date in the mock data.
					</div>
				{/if}
			</AppDialog.Body>
			<AppDialog.Footer>
				<Button aria-label="Close daily duties" onclick={closeDateDialog}>Close</Button>
			</AppDialog.Footer>
		</AppDialog.Content>
	</AppDialog.Root>
{/if}

<style>
	.calendar-shell {
		box-shadow: var(--shadow-sm);
	}

	:global(.calendar-matrix-root [data-slot='operational-matrix-table']) {
		min-width: calc(var(--calendar-personnel-width) + (var(--calendar-day-width) * var(--calendar-column-count, 31)));
		border-collapse: separate;
		border-spacing: 0;
		font-family: 'Source Serif 4', Georgia, serif;
	}

	:global(.calendar-matrix-root [data-slot='operational-matrix-table'] th),
	:global(.calendar-matrix-root [data-slot='operational-matrix-table'] td) {
		border-right: 1px solid var(--border);
		border-bottom: 1px solid var(--border);
		padding: 0;
	}

	:global(.calendar-matrix-root thead th) {
		position: sticky;
		top: 0;
		z-index: 5;
		background: var(--card);
	}

	:global(.calendar-matrix-root .calendar-corner) {
		left: 0;
		z-index: 20;
		height: 46px;
		border-right: 1px solid var(--border);
		background: var(--muted);
		padding: 0 12px;
		text-align: left;
		font-family: 'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.15em;
		color: var(--muted-foreground);
		text-transform: uppercase;
		vertical-align: middle;
	}

	:global(.calendar-page[data-view-mode='long-range'] .calendar-matrix-root .calendar-corner-month) {
		height: 34px;
	}

	:global(.calendar-page[data-view-mode='long-range'] .calendar-matrix-root .calendar-corner-days) {
		top: 34px;
		height: 30px;
		background: var(--card);
	}

	:global(.calendar-matrix-root .calendar-month-band) {
		height: 34px;
		border-right: 1px solid var(--border);
		background: var(--card);
		font-family: 'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.12em;
		color: var(--foreground);
		text-align: center;
		vertical-align: middle;
	}

	:global(.calendar-page[data-view-mode='long-range'] .calendar-matrix-root .calendar-date-header) {
		top: 34px;
		height: 30px;
	}

	:global(.calendar-matrix-root .calendar-date-header) {
		height: 46px;
		background: var(--card);
		vertical-align: middle;
	}

	:global(.calendar-matrix-root .calendar-date-header.is-weekend) {
		background: var(--muted);
	}

	:global(.calendar-matrix-root .calendar-date-header.is-holiday) {
		background: var(--warning-bg);
	}

	:global(.calendar-matrix-root .calendar-date-header.is-today) {
		background: var(--secondary);
		box-shadow: inset 0 -3px 0 var(--foreground);
	}

	:global(.date-header-button) {
		display: flex;
		width: 100%;
		height: 100%;
		border-radius: 0 !important;
		border-color: transparent !important;
		background: transparent !important;
		padding: 0 !important;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 2px;
		outline: none;
	}

	:global(.date-header-button:focus-visible) {
		box-shadow: inset 0 0 0 2px var(--ring);
	}

	.date-weekday {
		font-family: 'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 9px;
		font-weight: 700;
		letter-spacing: 0.1em;
		color: var(--muted-foreground);
	}

	.date-number {
		font-family: Georgia, 'Source Serif 4', serif;
		font-size: 16px;
		font-weight: 800;
		line-height: 1;
		color: var(--foreground);
	}

	.calendar-page[data-view-mode='long-range'] .date-number {
		font-family: Georgia, 'Source Serif 4', serif;
		font-size: 11px;
		font-weight: 800;
	}

	:global(.calendar-group-row th) {
		height: 16px;
		background: var(--muted);
		color: var(--muted-foreground);
		text-align: left;
		font-family: 'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 0.13em;
		text-transform: uppercase;
	}

	:global(.calendar-page[data-view-mode='month'] .calendar-group-row th) {
		background: var(--primary);
		color: var(--primary-foreground);
	}

	.calendar-page[data-view-mode='month'] .group-pin {
		border-left-color: color-mix(in oklch, var(--primary-foreground) 18%, transparent);
		color: color-mix(in oklch, var(--primary-foreground) 68%, transparent);
	}

	.group-toggle {
		display: inline-flex;
		width: 22px;
		justify-content: center;
		font-size: 9px;
	}

	.group-pin {
		display: inline-flex;
		margin-left: 22px;
		border-left: 1px solid var(--border);
		padding-left: 12px;
		color: var(--muted-foreground);
	}

	:global(.calendar-person-row) {
		height: var(--calendar-row-height);
	}

	:global(.calendar-person-header) {
		position: sticky;
		left: 0;
		z-index: 4;
		height: var(--calendar-row-height);
		border-right: 1px solid var(--border);
		background: var(--card);
		text-align: left;
		vertical-align: middle;
	}

	:global(.calendar-person-header *) {
		pointer-events: none;
	}

	.person-rank {
		display: inline-block;
		box-sizing: border-box;
		width: 42px;
		padding-left: 8px;
		font-family: 'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.05em;
		color: var(--warning);
	}

	.person-name {
		font-family: Georgia, 'Source Serif 4', serif;
		font-size: 12px;
		font-weight: 700;
		color: var(--foreground);
		white-space: nowrap;
	}

	.calendar-page[data-view-mode='long-range'] .person-rank {
		width: 36px;
		padding-left: 8px;
		font-size: 10px;
	}

	.calendar-page[data-view-mode='long-range'] .person-name {
		font-size: 11px;
		font-weight: 500;
	}

	.person-badge {
		margin-left: 8px;
		border-radius: 4px;
		background: var(--warning-bg);
		padding: 1px 5px;
		font-family: 'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 9px;
		font-weight: 800;
		letter-spacing: 0.08em;
		color: var(--warning);
	}

	:global(.calendar-status-cell) {
		height: var(--calendar-row-height);
		background: var(--card);
	}

	:global(.calendar-status-cell.is-weekend) {
		background: var(--muted);
	}

	:global(.calendar-status-cell.is-holiday) {
		background: var(--warning-bg);
	}

	:global(.calendar-status-cell.is-today) {
		box-shadow: inset 0 0 0 1px var(--foreground);
	}

	:global(.calendar-status-cell [data-slot='operational-matrix-cell-trigger']) {
		position: relative;
		display: block;
		width: 100%;
		height: 100%;
		overflow: hidden;
		outline: none;
	}

	:global(.calendar-status-cell [data-slot='operational-matrix-cell-trigger']:focus-visible) {
		box-shadow: inset 0 0 0 2px var(--ring);
	}

	.status-fill,
	.empty-fill {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: flex-start;
		justify-content: flex-start;
		overflow: hidden;
		padding: 3px;
		font-family: 'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 7px;
		font-weight: 800;
		letter-spacing: 0.05em;
		line-height: 1;
		text-transform: uppercase;
		white-space: nowrap;
	}

	.calendar-page[data-view-mode='long-range'] .status-fill,
	.calendar-page[data-view-mode='long-range'] .empty-fill {
		padding: 0;
		font-size: 0;
	}

	.duty-marker {
		position: absolute;
		right: 3px;
		bottom: 3px;
		z-index: 1;
		max-width: calc(100% - 6px);
		overflow: hidden;
		border-radius: 2px;
		padding: 0 3px;
		font-family: 'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 7px;
		font-weight: 800;
		line-height: 1.2;
		text-overflow: ellipsis;
		text-transform: uppercase;
		white-space: nowrap;
		box-shadow: inset 0 0 0 1px color-mix(in oklch, var(--primary-foreground) 55%, transparent);
	}

	.calendar-page[data-view-mode='long-range'] .duty-marker {
		right: 0;
		bottom: 0;
		left: 0;
		height: 3px;
		padding: 0;
		font-size: 0;
	}

	.legend-title {
		font-family: 'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
		font-size: 12px;
		font-weight: 800;
		letter-spacing: 0.14em;
		color: var(--muted-foreground);
		text-transform: uppercase;
	}

	@media (max-width: 760px) {
		.calendar-page {
			padding: 8px;
		}

		.calendar-toolbar {
			flex-wrap: wrap;
			gap: 8px;
			padding: 14px;
		}

		.calendar-toolbar h1 {
			order: -1;
			width: 100%;
			flex: none;
			padding: 0;
			font-size: 28px;
		}

		.calendar-page {
			--calendar-personnel-width: 168px !important;
			--calendar-day-width: 24px !important;
		}

		.calendar-page[data-view-mode='long-range'] {
			--calendar-day-width: 16px !important;
		}
	}
</style>
