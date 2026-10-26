<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import { evaluateUpcomingLosses, type Personnel } from '$features/personnel/contracts';
	import {
		DEFAULT_LOSS_WARNING_WINDOW_DAYS,
		DEFAULT_TRAINING_READINESS_GOAL_PERCENT
	} from '$features/organization/contracts';
	import type { TrainingType, PersonnelTraining, TrainingStatus } from '$features/training/training.types';
	import {
		getTrainingStatus,
		TRAINING_STATUS_SORT_ORDER,
		type TrainingStatusInfo
	} from '$features/training/utils/trainingStatus';
	import {
		getCellDisplayText,
		getCellStatusLabel,
		getColumnIntervalLabel
	} from '$features/training/utils/cellDisplayText';
	import { BRIEFING_BAND_TIER } from '$features/training/utils/briefingBandTier';
	import { MATRIX_HORIZON_DAYS as HORIZON_DAYS } from '$features/training/utils/matrixReadiness';
	import { trainingMatrixGaps, type TrainingMatrixGaps } from '$features/training/utils/trainingBriefing';
	import * as OperationalMatrix from '$lib/components/ui/operational-matrix';
	import * as Popover from '$lib/components/ui/popover';
	import { formatReadinessBandPercent, readinessBandTone } from '$lib/components/patterns/readiness-band/index.js';
	import type { ColumnDef, GroupDef } from '$lib/components/ui/data-table';
	import { useDataTable } from '$lib/components/ui/data-table';
	import { Button } from '$lib/components/ui/button';
	import TrainingCellPopover from './TrainingCellPopover.svelte';
	import TrainingMatrixCell, { trainingMatrixCellClasses } from './TrainingMatrixCell.svelte';

	interface Props {
		personnel: Personnel[];
		trainingTypes: TrainingType[];
		trainings: PersonnelTraining[];
		/** Names the matrix: the selected view, or all trainings. */
		title: string;
		orgId: string;
		/** The Organization's calendar day, YYYY-MM-DD: the readiness reference and the popover's default date. */
		asOf: string;
		/** Null while the Organization goal is unavailable: group readiness is then left out. */
		goalPercent: number | null;
		/** Makes cells open the recording popover. */
		onRecord?: (data: Omit<PersonnelTraining, 'id'>) => void | Promise<void>;
		onPersonClick?: (person: Personnel) => void;
		groupBy?: GroupDef<Personnel>;
	}

	interface TrainingCellMetadata {
		training: PersonnelTraining | undefined;
		statusInfo: TrainingStatusInfo;
		displayText: string;
	}

	type MatrixRow = OperationalMatrix.OperationalMatrixRow & {
		meta: {
			person: Personnel;
			rank: string;
			group: string;
		};
	};

	type MatrixColumn = OperationalMatrix.OperationalMatrixColumn & {
		meta: {
			type: TrainingType;
			color: string;
		};
	};

	let {
		personnel,
		trainingTypes,
		trainings,
		title,
		orgId,
		asOf,
		goalPercent,
		onRecord,
		onPersonClick,
		groupBy
	}: Props = $props();

	const columns: ColumnDef<Personnel>[] = [
		{
			key: 'name',
			header: 'Name',
			value: (p) => `${p.lastName}, ${p.firstName}`,
			compare: (a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName)
		}
	];

	const table = useDataTable({
		data: () => personnel,
		columns,
		initialSortKey: 'name',
		groupBy: () => groupBy,
		resolveColumn: (key) => {
			const type = trainingTypes.find((t) => t.id === key);
			if (!type) return undefined;
			const status = (p: Personnel) => getCellMetadata(p, type).statusInfo.status;
			let sortOrder: Map<string, number> | undefined;
			const rank = (p: Personnel) => {
				sortOrder ??= new Map(personnel.map((person) => [person.id, TRAINING_STATUS_SORT_ORDER[status(person)]]));
				return sortOrder.get(p.id) ?? 0;
			};
			return {
				key: type.id,
				header: type.name,
				value: status,
				compare: (a: Personnel, b: Personnel) => rank(a) - rank(b)
			};
		}
	});

	function sortIndicator(key: string): string {
		if (table.sortKey !== key) return '';
		return table.sortDirection === 'asc' ? ' ▲' : ' ▼';
	}

	function ariaSort(key: string): 'ascending' | 'descending' | 'none' {
		if (table.sortKey !== key) return 'none';
		return table.sortDirection === 'asc' ? 'ascending' : 'descending';
	}

	function createTrainingKey(personnelId: string, typeId: string): string {
		return `${personnelId}-${typeId}`;
	}

	const trainingLookup = $derived.by(() => {
		const map = new SvelteMap<string, PersonnelTraining>();
		for (const t of trainings) {
			map.set(createTrainingKey(t.personnelId, t.trainingTypeId), t);
		}
		return map;
	});

	function getCellMetadata(person: Personnel, type: TrainingType): TrainingCellMetadata {
		const training = trainingLookup.get(createTrainingKey(person.id, type.id));
		const statusInfo = getTrainingStatus(training, type, person, asOf);
		return {
			training,
			statusInfo,
			displayText: getCellDisplayText(statusInfo, training, type)
		};
	}

	const matrixColumns = $derived<MatrixColumn[]>(
		trainingTypes.map((type) => ({
			id: type.id,
			label: type.name,
			meta: {
				type,
				color: type.color
			}
		}))
	);

	function toMatrixRow(person: Personnel): MatrixRow {
		return {
			id: person.id,
			label: `${person.lastName}, ${person.firstName}`,
			meta: {
				person,
				rank: person.rank,
				group: person.groupName || 'Unassigned'
			}
		};
	}

	function gapsFor(people: Personnel[]): TrainingMatrixGaps {
		return trainingMatrixGaps({
			personnel: people,
			types: trainingTypes,
			records: trainings,
			asOf,
			horizonDays: HORIZON_DAYS,
			goalPercent: goalPercent ?? DEFAULT_TRAINING_READINESS_GOAL_PERCENT
		});
	}

	const footerGaps = $derived(gapsFor(personnel));
	const groupGaps = $derived(new Map(table.groups.map((group) => [group.key, gapsFor(group.rows)])));

	const departureTags = $derived(
		new Map(
			evaluateUpcomingLosses(personnel, DEFAULT_LOSS_WARNING_WINDOW_DAYS, asOf).map((loss) => [
				loss.personId,
				loss.triggerType === 'ETS' ? 'ETS' : 'PCS'
			])
		)
	);

	// Spacers must match the rendered heights: the h-10 cell plus its collapsed 1px border, and the h-8 group band.
	// Both are rem, so they follow the reader's default font size.
	const ROW_HEIGHT_REM = 2.5;
	const ROW_BORDER_PX = 1;
	const GROUP_HEIGHT_REM = 2;
	const FALLBACK_VIEWPORT_HEIGHT = 640;
	const OVERSCAN_ROWS = 8;
	const HEADER_ROW_COUNT = 1;

	let remPx = $state(16);
	const rowHeight = $derived(ROW_HEIGHT_REM * remPx + ROW_BORDER_PX);
	const groupHeight = $derived(GROUP_HEIGHT_REM * remPx);

	onMount(() => {
		remPx = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
	});

	function rowItem(person: Personnel): OperationalMatrix.VirtualMatrixItem<MatrixRow> {
		return { kind: 'row', key: person.id, row: toMatrixRow(person), height: rowHeight };
	}

	let scrollTop = $state(0);
	let measuredViewportHeight = $state(0);
	let focusedRowId = $state<string | null>(null);
	// The popover's row stays mounted until focus is back on its cell, even after it scrolls out of the window.
	let pinnedRowId = $state<string | null>(null);

	function trackFocus(event: FocusEvent) {
		const row = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-matrix-row]') : null;
		focusedRowId = row?.dataset.rowId ?? null;
	}

	function releaseFocus(event: FocusEvent & { currentTarget: HTMLElement }) {
		const next = event.relatedTarget;
		if (!(next instanceof Node) || !event.currentTarget.contains(next)) focusedRowId = null;
	}

	type RecordTarget = { personId: string; typeId: string };
	let matrixElement = $state<HTMLElement | null>(null);
	let recordTarget = $state<RecordTarget | null>(null);
	let anchorElement = $state<HTMLElement | null>(null);
	let returnTarget: RecordTarget | null = null;
	let returnFocus = true;

	function findCell(target: RecordTarget): HTMLElement | null {
		const cells = matrixElement?.querySelectorAll<HTMLElement>('[data-matrix-cell]') ?? [];
		return (
			[...cells].find((cell) => cell.dataset.rowId === target.personId && cell.dataset.columnId === target.typeId) ??
			null
		);
	}

	// The popover keeps what it opened on while it animates closed, so saving into the store cannot empty it mid-exit.
	let recordSnapshot = $state.raw<{
		person: Personnel;
		type: TrainingType;
		training: PersonnelTraining | undefined;
		statusInfo: TrainingStatusInfo;
	} | null>(null);

	function openRecord(person: Personnel, type: TrainingType) {
		const target = { personId: person.id, typeId: type.id };
		const { training, statusInfo } = getCellMetadata(person, type);
		anchorElement = findCell(target);
		returnTarget = target;
		returnFocus = true;
		pinnedRowId = person.id;
		recordSnapshot = { person, type, training, statusInfo };
		recordTarget = target;
	}

	function closeRecord() {
		recordTarget = null;
	}

	function restoreCellFocus(event: Event) {
		event.preventDefault();
		if (recordTarget !== null) return;
		if (returnFocus && returnTarget) findCell(returnTarget)?.querySelector<HTMLElement>('button')?.focus();
		pinnedRowId = null;
	}

	async function openPersonRecord(person: Personnel) {
		returnFocus = false;
		const target = returnTarget;
		recordTarget = null;
		await tick();
		if (target) findCell(target)?.querySelector<HTMLElement>('button')?.focus();
		pinnedRowId = null;
		onPersonClick?.(person);
	}

	const matrixRows = $derived<MatrixRow[]>(table.rows.map(toMatrixRow));
	const virtualItems = $derived<OperationalMatrix.VirtualMatrixItem<MatrixRow>[]>(
		table.groups.length === 0
			? table.rows.map(rowItem)
			: table.groups.flatMap((group) => [
					{
						kind: 'group' as const,
						key: `group:${group.key}`,
						group: {
							id: group.key,
							label: group.label,
							rowIds: group.rows.map((person) => person.id),
							collapsed: group.collapsed
						},
						height: groupHeight
					},
					...(group.collapsed ? [] : group.rows.map(rowItem))
				])
	);
	const virtualWindow = $derived(
		OperationalMatrix.buildVirtualMatrixWindow(virtualItems, {
			scrollTop,
			viewportHeight: measuredViewportHeight || FALLBACK_VIEWPORT_HEIGHT,
			overscanPx: rowHeight * OVERSCAN_ROWS,
			pinnedKey: pinnedRowId ?? focusedRowId
		})
	);
	const totalColumns = $derived(matrixColumns.length + 1);

	const legendItems: Array<{ status: TrainingStatus; label: string; sample: string }> = [
		{ status: 'current', label: 'Current until', sample: 'Jun ’27' },
		{ status: 'warning-yellow', label: 'Expiring soon', sample: '' },
		{ status: 'warning-orange', label: 'Expiring', sample: '' },
		{ status: 'expired', label: 'Expired', sample: '' },
		{ status: 'not-completed', label: 'No record', sample: '' },
		{ status: 'not-required', label: 'Not required', sample: '—' },
		{ status: 'exempt', label: 'Exempt', sample: '' }
	];
</script>

{#snippet gapCell(gap: TrainingMatrixGaps['byType'][string] | undefined)}
	{#if gap && (gap.notReady > 0 || gap.lapsing > 0)}
		<span class="flex items-center justify-center gap-1.5 text-xs font-semibold">
			{#if gap.notReady > 0}
				<span class="text-danger-foreground">{gap.notReady}&#32;<span class="sr-only">not ready</span></span>
			{/if}
			{#if gap.lapsing > 0}
				<span class="text-warning-foreground"
					>+{gap.lapsing}&#32;<span class="sr-only">lapsing in {HORIZON_DAYS} days</span></span
				>
			{/if}
		</span>
	{/if}
{/snippet}

{#snippet matrixRow(row: MatrixRow, virtualIndex: number)}
	<OperationalMatrix.Row {row} virtualIndex={virtualIndex + HEADER_ROW_COUNT} class="bg-card hover:bg-muted/20">
		<OperationalMatrix.RowHeader
			{row}
			sticky
			class="sticky left-0 z-10 w-48 min-w-32 max-w-48 border border-border bg-card px-2 py-1.5 text-left align-middle sm:min-w-48 sm:px-3"
		>
			{@const tag = departureTags.get(row.id)}
			{#if onPersonClick}
				<Button
					variant="cell"
					size="none"
					class="w-full min-w-0 justify-start gap-2 text-left sm:gap-4"
					onclick={() => onPersonClick?.(row.meta.person)}
				>
					<span class="w-8 shrink-0 font-mono text-xs font-medium text-muted-foreground">
						{row.meta.rank}
					</span>
					<span class="truncate text-sm font-medium">{row.label}</span>
					{#if tag}
						<span class="shrink-0 rounded-sm border border-border px-1 font-mono text-[10px] text-muted-foreground">
							{tag}
						</span>
					{/if}
				</Button>
			{:else}
				<span class="flex items-baseline gap-2 text-foreground sm:gap-4">
					<span class="w-8 shrink-0 font-mono text-xs font-medium text-muted-foreground">
						{row.meta.rank}
					</span>
					<span class="truncate text-sm font-medium">{row.label}</span>
					{#if tag}
						<span class="shrink-0 rounded-sm border border-border px-1 font-mono text-[10px] text-muted-foreground">
							{tag}
						</span>
					{/if}
				</span>
			{/if}
		</OperationalMatrix.RowHeader>

		{#each matrixColumns as column (column.id)}
			{@const cell = getCellMetadata(row.meta.person, column.meta.type)}
			<OperationalMatrix.Cell
				{row}
				{column}
				ariaLabel={`${row.meta.person.lastName} ${column.label}: ${getCellStatusLabel(cell.statusInfo)}`}
				onSelect={onRecord ? () => openRecord(row.meta.person, column.meta.type) : undefined}
				class="min-w-28 bg-card sm:min-w-32"
			>
				<TrainingMatrixCell
					status={cell.statusInfo.status}
					label={cell.displayText}
					srLabel={getCellStatusLabel(cell.statusInfo)}
				/>
			</OperationalMatrix.Cell>
		{/each}
	</OperationalMatrix.Row>
{/snippet}

<div bind:this={matrixElement} class="contents">
	<OperationalMatrix.Root
		rows={matrixRows}
		columns={matrixColumns}
		class="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-2"
	>
		<div class="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
			<div class="flex min-w-0 flex-wrap items-baseline gap-x-3">
				<h2 class="font-heading text-xl font-semibold tracking-tight">{title}</h2>
				<p class="font-mono text-xs text-muted-foreground">
					{personnel.length} personnel × {trainingTypes.length} types · {groupBy ? 'by group' : 'A–Z'}
				</p>
			</div>
			<ul class="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground" aria-label="Status legend">
				{#each legendItems as item (item.status)}
					<li class="flex items-center gap-1.5">
						{#if item.status === 'exempt'}
							<span class="font-mono text-xs uppercase">{item.label}</span>
						{:else}
							<span
								class={[
									'inline-flex h-4 min-w-5 items-center justify-center px-1 font-mono text-[10px]',
									trainingMatrixCellClasses[item.status]
								]}
								aria-hidden="true">{item.sample}</span
							>
							{item.label}
						{/if}
					</li>
				{/each}
			</ul>
		</div>

		<OperationalMatrix.Viewport
			ariaLabel="Training matrix viewport"
			class="h-full min-h-0 rounded-lg border border-border bg-card"
			virtualized
			onViewportHeightChange={(height) => (measuredViewportHeight = height)}
			onscroll={(event) => (scrollTop = event.currentTarget.scrollTop)}
			onfocusin={trackFocus}
			onfocusout={releaseFocus}
		>
			<OperationalMatrix.Table
				ariaLabel="Training status matrix"
				aria-rowcount={virtualItems.length + HEADER_ROW_COUNT}
				class="min-w-max table-fixed text-sm [&_[data-matrix-column-header]]:border [&_[data-matrix-column-header]]:border-border [&_[data-matrix-column-header]]:bg-muted [&_[data-matrix-cell]]:h-10 [&_[data-matrix-cell]]:border [&_[data-matrix-cell]]:border-border [&_[data-matrix-cell]]:p-0 [&_[data-slot=operational-matrix-cell-content]]:flex [&_[data-slot=operational-matrix-cell-content]]:h-10 [&_[data-slot=operational-matrix-cell-content]]:w-full [&_[data-slot=operational-matrix-cell-trigger]]:flex [&_[data-slot=operational-matrix-cell-trigger]]:h-10 [&_[data-slot=operational-matrix-cell-trigger]]:w-full [&_[data-slot=operational-matrix-cell-trigger]]:focus-visible:outline-hidden [&_[data-slot=operational-matrix-cell-trigger]]:focus-visible:ring-2 [&_[data-slot=operational-matrix-cell-trigger]]:focus-visible:ring-ring [&_[data-slot=operational-matrix-cell-trigger]]:focus-visible:ring-inset [&_[data-selected=true]]:ring-2 [&_[data-selected=true]]:ring-foreground [&_[data-selected=true]]:ring-inset"
			>
				<OperationalMatrix.Header>
					<OperationalMatrix.HeaderRow aria-rowindex={1}>
						<OperationalMatrix.CornerCell
							sticky
							class="sticky left-0 top-0 z-30 w-32 min-w-32 bg-muted px-2 py-1.5 text-left align-bottom sm:w-48 sm:min-w-48 sm:px-3"
							aria-sort={ariaSort('name')}
						>
							<Button
								variant="ghost"
								size="none"
								class="gap-2 font-mono text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase"
								onclick={() => table.toggleSort('name')}
							>
								<span>Personnel<span aria-hidden="true">{sortIndicator('name')}</span></span>
								<span class="font-normal tracking-normal">{personnel.length}</span>
							</Button>
						</OperationalMatrix.CornerCell>
						{#each matrixColumns as column (column.id)}
							<OperationalMatrix.ColumnHeader
								{column}
								sticky
								class="sticky top-0 z-20 h-16 w-28 min-w-28 bg-muted px-1.5 text-center sm:w-32 sm:min-w-32"
								aria-sort={ariaSort(column.id)}
							>
								<Button
									variant="ghost"
									size="none"
									class="h-full w-full flex-col gap-0.5 px-1 text-center whitespace-normal"
									onclick={() => table.toggleSort(column.id)}
								>
									<span class="flex min-w-0 items-start gap-1.5">
										<span
											class="mt-1 size-2 shrink-0 rounded-sm"
											style:background-color={column.meta.color}
											aria-hidden="true"
										></span>
										<span class="line-clamp-2 text-xs font-bold normal-case tracking-normal text-foreground">
											{column.label}<span aria-hidden="true">{sortIndicator(column.id)}</span>
										</span>
									</span>
									<span class="font-mono text-[10px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
										{getColumnIntervalLabel(column.meta.type)}
									</span>
								</Button>
							</OperationalMatrix.ColumnHeader>
						{/each}
					</OperationalMatrix.HeaderRow>
				</OperationalMatrix.Header>

				<OperationalMatrix.Body>
					{#if virtualWindow.topSpacerHeight > 0}
						<tr aria-hidden="true" data-matrix-spacer="top">
							<td colspan={totalColumns} style:height={`${virtualWindow.topSpacerHeight}px`}></td>
						</tr>
					{/if}
					{#each virtualWindow.visibleItems as item (item.key)}
						{#if item.gapBefore > 0}
							<tr aria-hidden="true" data-matrix-spacer="gap">
								<td colspan={totalColumns} style:height={`${item.gapBefore}px`}></td>
							</tr>
						{/if}
						{#if item.kind === 'group'}
							{@const gaps = groupGaps.get(item.group.id)}
							<OperationalMatrix.RowGroup
								group={item.group}
								columnSpan={1}
								virtualIndex={item.virtualIndex + HEADER_ROW_COUNT}
								class="h-8 bg-muted [&_th]:sticky [&_th]:left-0 [&_th]:z-10 [&_th]:w-32 [&_th]:min-w-32 [&_th]:bg-muted [&_th]:px-2 [&_th]:py-0 [&_th]:text-left sm:[&_th]:w-48 sm:[&_th]:min-w-48 sm:[&_th]:px-3"
							>
								<div class="flex items-center gap-2">
									<button
										type="button"
										class="flex min-w-0 items-center gap-1.5 rounded-sm font-heading text-sm font-semibold tracking-wide uppercase focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden"
										aria-expanded={!item.group.collapsed}
										onclick={() => table.toggleGroup(item.group.id)}
									>
										{#if item.group.collapsed}
											<ChevronRightIcon class="size-4 shrink-0" aria-hidden="true" />
										{:else}
											<ChevronDownIcon class="size-4 shrink-0" aria-hidden="true" />
										{/if}
										<span class="truncate">{item.group.label}</span>
										<span class="font-mono text-xs font-normal text-muted-foreground max-sm:hidden"
											>{item.group.rowIds.length}</span
										>
									</button>
									{#if gaps && goalPercent !== null}
										<span
											class={[
												'ml-auto shrink-0 font-mono text-[11px] font-semibold tabular-nums',
												readinessBandTone[BRIEFING_BAND_TIER[gaps.readiness.band]]
											]}
										>
											{formatReadinessBandPercent(gaps.readiness.percent)}<span class="sr-only"> ready</span>
										</span>
									{/if}
								</div>
								{#snippet trailing()}
									{#each matrixColumns as column (column.id)}
										<td class="border border-border p-0 text-center">
											{#if item.group.collapsed}
												{@render gapCell(gaps?.byType[column.id])}
											{/if}
										</td>
									{/each}
								{/snippet}
							</OperationalMatrix.RowGroup>
						{:else}
							{@render matrixRow(item.row, item.virtualIndex)}
						{/if}
					{/each}
					{#if virtualWindow.bottomSpacerHeight > 0}
						<tr aria-hidden="true" data-matrix-spacer="bottom">
							<td colspan={totalColumns} style:height={`${virtualWindow.bottomSpacerHeight}px`}></td>
						</tr>
					{/if}
				</OperationalMatrix.Body>

				<tfoot data-matrix-footer>
					<tr>
						<th
							scope="row"
							class="sticky bottom-0 left-0 z-30 w-32 min-w-32 border border-border bg-muted px-2 py-2 text-left font-mono text-[10px] font-semibold tracking-[0.08em] uppercase sm:w-48 sm:min-w-48 sm:px-3"
						>
							Not ready now
							<span class="block font-normal text-muted-foreground">Expired or no record</span>
						</th>
						{#each matrixColumns as column (column.id)}
							{@const gap = footerGaps.byType[column.id]}
							<td class="sticky bottom-0 z-20 border border-border bg-muted px-1 py-2 text-center">
								<span
									class={[
										'block font-heading text-xl leading-none font-semibold tabular-nums',
										gap.notReady > 0 ? 'text-danger-foreground' : 'text-muted-foreground'
									]}>{gap.notReady}&#32;<span class="sr-only">not ready</span></span
								>
								<span
									class={[
										'mt-1 block font-mono text-[10px]',
										gap.lapsing > 0 ? 'text-warning-foreground' : 'text-muted-foreground'
									]}
								>
									{gap.lapsing > 0 ? `+${gap.lapsing} in ${HORIZON_DAYS}d` : '—'}
								</span>
							</td>
						{/each}
					</tr>
				</tfoot>
			</OperationalMatrix.Table>
		</OperationalMatrix.Viewport>
	</OperationalMatrix.Root>

	{#if onRecord}
		<Popover.Root open={recordTarget !== null} onOpenChange={(open) => !open && closeRecord()}>
			<Popover.Content
				customAnchor={anchorElement}
				align="start"
				collisionPadding={8}
				class="w-88 max-w-[calc(100vw-1rem)] p-3"
				onCloseAutoFocus={restoreCellFocus}
			>
				{#if recordSnapshot}
					{@const snapshot = recordSnapshot}
					{#key `${snapshot.person.id}:${snapshot.type.id}`}
						<TrainingCellPopover
							person={snapshot.person}
							type={snapshot.type}
							training={snapshot.training}
							statusInfo={snapshot.statusInfo}
							{orgId}
							today={asOf}
							isCurrent={() =>
								recordTarget?.personId === snapshot.person.id && recordTarget?.typeId === snapshot.type.id}
							onSave={onRecord}
							onOpenRecord={onPersonClick ? openPersonRecord : undefined}
							onClose={closeRecord}
						/>
					{/key}
				{/if}
			</Popover.Content>
		</Popover.Root>
	{/if}
</div>
