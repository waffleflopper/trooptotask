<script lang="ts" module>
	const TOTAL_ROW_ID = 'total';
	const MATRIX_CLASS =
		'min-w-max border-separate border-spacing-[2px] [&_[data-slot=operational-matrix-cell-trigger]]:block [&_[data-slot=operational-matrix-cell-trigger]]:w-full [&_[data-slot=operational-matrix-cell-trigger]]:rounded-[2px] [&_[data-slot=operational-matrix-cell-trigger]]:outline-none [&_[data-slot=operational-matrix-cell-trigger]]:focus-visible:relative [&_[data-slot=operational-matrix-cell-trigger]]:focus-visible:z-20 [&_[data-slot=operational-matrix-cell-trigger]]:focus-visible:ring-2 [&_[data-slot=operational-matrix-cell-trigger]]:focus-visible:ring-foreground [&_[data-selected]_[data-slot=operational-matrix-cell-trigger]]:outline-2 [&_[data-selected]_[data-slot=operational-matrix-cell-trigger]]:outline-offset-1 [&_[data-selected]_[data-slot=operational-matrix-cell-trigger]]:outline-dashed [&_[data-selected]_[data-slot=operational-matrix-cell-trigger]]:outline-foreground';
	const HEADER_CLASS = 'font-mono text-[11px] font-normal uppercase tracking-[0.08em] text-muted-foreground';
	const TIER = { success: 'not-applicable', warning: 'caution', destructive: 'danger' } as const;
	const TONE = { success: 'good', warning: 'caution', destructive: 'danger' } as const;
</script>

<script lang="ts">
	import * as OperationalMatrix from '$lib/components/ui/operational-matrix';
	import type { OperationalMatrixColumn, OperationalMatrixRow } from '$lib/components/ui/operational-matrix';
	import * as ReadinessBand from '$lib/components/patterns/readiness-band/index.js';
	import { readinessBandTone } from '$lib/components/patterns/readiness-band/index.js';
	import { showSubGroups } from '$lib/stores/showSubGroups.svelte';
	import { formatDayMonth, formatWeekdayDayMonth } from '$lib/utils/dates';
	import { lowestCell } from '../../utils/availabilityBoard';
	import {
		readinessTone,
		type ForecastDay,
		type GroupReadinessResult,
		type ReadinessCell,
		type ReadinessGroupRow
	} from '../../utils/calendarReports';

	interface Props {
		readiness: GroupReadinessResult;
		/** The whole selection per day, for the total row. */
		days: ForecastDay[];
		selectedDate: string | null;
		onSelect: (date: string) => void;
	}

	let { readiness, days, selectedDate, onSelect }: Props = $props();

	type MatrixRow = OperationalMatrixRow & { source: ReadinessGroupRow; level: number; subGroupRow: boolean };

	const matrixRow = (source: ReadinessGroupRow, subGroupRow = false): MatrixRow => ({
		id: `row:${source.groupId}`,
		label: source.groupName,
		source,
		level: source.level,
		subGroupRow
	});
	const totalRow = $derived<MatrixRow>({
		id: TOTAL_ROW_ID,
		label: 'Total',
		source: { groupId: TOTAL_ROW_ID, groupName: 'Total', level: 0, subtotal: false, cells: days },
		level: 0,
		subGroupRow: false
	});
	const rows = $derived<MatrixRow[]>([
		...readiness.sets.flatMap((set) => [
			matrixRow(set.top),
			...(showSubGroups.current ? set.below.map((row) => matrixRow(row, true)) : [])
		]),
		totalRow
	]);
	const columns = $derived<OperationalMatrixColumn[]>(
		readiness.dates.map((date) => ({ id: date, label: String(Number(date.slice(8))) }))
	);

	function peopleLabel(row: ReadinessGroupRow): string {
		const count = row.cells[0]?.totalPersonnel ?? 0;
		return `${count} ${count === 1 ? 'person' : 'people'}`;
	}

	function cellLabel(row: ReadinessGroupRow, cell: ReadinessCell): string {
		const where = `${row.groupName}, ${formatWeekdayDayMonth(cell.date)}`;
		const count = `${cell.availableCount} of ${cell.totalPersonnel} here`;
		return readinessTone(cell) === 'success'
			? `${where}: ${count}, 80% or more`
			: `${where}: ${count}, ${cell.availablePercent}%`;
	}
</script>

<OperationalMatrix.Root {rows} {columns} selectedCell={null}>
	<OperationalMatrix.Viewport ariaLabel="Group availability by day">
		<OperationalMatrix.Table ariaLabel="Group availability by day" class={MATRIX_CLASS}>
			<OperationalMatrix.Header>
				<OperationalMatrix.HeaderRow>
					<OperationalMatrix.CornerCell
						class="sticky left-0 z-10 w-28 min-w-28 sm:w-[170px] sm:min-w-[170px] bg-background pb-2 text-left {HEADER_CLASS}"
					>
						Group
					</OperationalMatrix.CornerCell>
					<th scope="col" class="w-16 min-w-16 pb-2 px-1 text-right sm:w-24 sm:min-w-24 sm:px-2 {HEADER_CLASS}"
						>Lowest</th
					>
					{#each columns as column (column.id)}
						<OperationalMatrix.ColumnHeader
							{column}
							aria-label={formatWeekdayDayMonth(column.id)}
							class="min-w-5 px-0 pb-2 text-center {HEADER_CLASS} {column.id === selectedDate
								? 'font-semibold text-foreground'
								: ''}"
						/>
					{/each}
				</OperationalMatrix.HeaderRow>
			</OperationalMatrix.Header>
			<OperationalMatrix.Body>
				{#each rows as row (row.id)}
					{@const total = row.id === TOTAL_ROW_ID}
					{@const lowest = lowestCell(row.source.cells)}
					<OperationalMatrix.Row
						{row}
						data-sub-group-row={row.subGroupRow || undefined}
						class={total ? '[&>*]:border-t-2 [&>*]:border-foreground [&>*]:pt-1.5' : undefined}
					>
						<OperationalMatrix.RowHeader
							{row}
							sticky
							class="sticky left-0 z-10 bg-background pr-3 text-left align-middle"
							style="padding-left: {row.level}rem"
						>
							<span class="block font-serif text-[15px] font-medium">{row.label}</span>
							<span class="block font-mono text-[11px] text-muted-foreground">{peopleLabel(row.source)}</span>
						</OperationalMatrix.RowHeader>
						<td class="px-1 text-right align-middle sm:px-2">
							{#if lowest}
								<span class={['block font-heading text-xl font-bold', readinessBandTone[TONE[readinessTone(lowest)]]]}
									>{lowest.availablePercent}%</span
								>
								{#if readinessTone(lowest) !== 'success'}
									<span class="block font-mono text-[11px] text-muted-foreground uppercase"
										>{formatDayMonth(lowest.date)}</span
									>
								{/if}
							{/if}
						</td>
						{#each row.source.cells as cell, index (cell.date)}
							{@const tone = readinessTone(cell)}
							<OperationalMatrix.Cell
								{row}
								column={columns[index]}
								selected={cell.date === selectedDate}
								ariaLabel={cellLabel(row.source, cell)}
								onSelect={() => onSelect(cell.date)}
								class="p-0"
							>
								<ReadinessBand.Cell
									palette="semantic"
									size="dense"
									tier={TIER[tone]}
									percent={cell.availablePercent}
									label={tone === 'success' ? '' : String(cell.availablePercent)}
								/>
							</OperationalMatrix.Cell>
						{/each}
					</OperationalMatrix.Row>
				{/each}
			</OperationalMatrix.Body>
		</OperationalMatrix.Table>
	</OperationalMatrix.Viewport>
</OperationalMatrix.Root>
