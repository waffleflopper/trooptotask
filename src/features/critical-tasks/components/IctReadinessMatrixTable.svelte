<script lang="ts">
	import * as OperationalMatrix from '$lib/components/ui/operational-matrix';
	import type { OperationalMatrixColumn, OperationalMatrixRow } from '$lib/components/ui/operational-matrix';
	import * as ReadinessBand from '$lib/components/ui/readiness-band/index.js';
	import * as ReportWorkspace from '$lib/components/ui/report-workspace';
	import type {
		IctReadinessMatrix,
		IctReadinessMatrixCell,
		IctReadinessMatrixRow
	} from '$features/critical-tasks/utils/ictReports';

	interface Props {
		matrix: IctReadinessMatrix;
		loading?: boolean;
	}

	const DESCRIPTION_ID = 'ict-readiness-matrix-description';

	let { matrix, loading = false }: Props = $props();
	type MatrixRow = OperationalMatrixRow & { source: IctReadinessMatrixRow };
	type MatrixColumn = OperationalMatrixColumn & {
		source: { kind: 'category'; key: string; label: string } | { kind: 'average'; key: 'average'; label: 'Avg' };
	};

	const rows = $derived<MatrixRow[]>(
		matrix.rows.map((row) => ({
			id: row.mos,
			label: row.mos,
			readOnly: true,
			source: row
		}))
	);
	const columns = $derived<MatrixColumn[]>([
		...matrix.categories.map((category) => ({
			id: category.key,
			label: category.label,
			readOnly: true,
			source: { kind: 'category' as const, key: category.key, label: category.label }
		})),
		{
			id: 'average',
			label: 'Avg',
			readOnly: true,
			source: { kind: 'average' as const, key: 'average' as const, label: 'Avg' as const }
		}
	]);

	function pluralizeSoldier(count: number): string {
		return count === 1 ? 'Soldier' : 'Soldiers';
	}

	function readinessLabel(
		mos: string,
		label: string,
		percent: number | null,
		readyCount: number,
		applicableCount: number
	): string {
		if (percent === null) {
			return `${mos} ${label} readiness: not applicable`;
		}

		return `${mos} ${label} readiness: ${percent}%, ${readyCount} of ${applicableCount} current`;
	}

	function cellLabel(mos: string, cell: IctReadinessMatrixCell): string {
		return readinessLabel(mos, cell.categoryLabel, cell.readinessPercent, cell.readyCount, cell.applicableCount);
	}

	function averageLabel(row: IctReadinessMatrixRow): string {
		return readinessLabel(
			row.mos,
			'average',
			row.averageReadinessPercent,
			row.averageReadyCount,
			row.averageApplicableCount
		);
	}

	function getCell(row: IctReadinessMatrixRow, column: MatrixColumn): IctReadinessMatrixCell | null {
		if (column.source.kind === 'average') return null;
		return row.cells.find((cell) => cell.categoryKey === column.source.key) ?? null;
	}
</script>

<ReportWorkspace.Section
	title="Readiness Matrix - MOS x Task Category"
	meta={loading ? 'Updating' : 'Cell = % trained and current'}
	aria-busy={loading ? 'true' : 'false'}
>
	<p id={DESCRIPTION_ID} class="sr-only">
		MOS rows and task category columns, with each cell showing the percent trained and current.
	</p>

	{#if matrix.rows.length === 0}
		<ReportWorkspace.State
			state="no-data"
			title="No readiness matrix data is available for the active filters."
			class="border-dashed"
		/>
	{:else if !matrix.hasCategorizedTasks}
		<ReportWorkspace.State
			state="no-data"
			title="Task categories are not set yet."
			description="Add categories to build the MOS by category matrix."
			class="border-dashed"
		/>
	{:else}
		<OperationalMatrix.Root {rows} {columns}>
			<OperationalMatrix.Viewport ariaLabel="MOS by task category readiness matrix viewport">
				<OperationalMatrix.Table ariaLabel="MOS by task category readiness matrix" aria-describedby={DESCRIPTION_ID}>
					<OperationalMatrix.Header>
						<OperationalMatrix.HeaderRow>
							<OperationalMatrix.CornerCell>MOS</OperationalMatrix.CornerCell>
							{#each columns as column (column.id)}
								<OperationalMatrix.ColumnHeader {column} orientation="vertical">
									{column.label}
								</OperationalMatrix.ColumnHeader>
							{/each}
						</OperationalMatrix.HeaderRow>
					</OperationalMatrix.Header>

					<OperationalMatrix.Body>
						{#each rows as row (row.id)}
							<OperationalMatrix.Row {row}>
								<OperationalMatrix.RowHeader {row}>
									<span>{row.source.mos}</span>
									<span>{row.source.personnelCount} {pluralizeSoldier(row.source.personnelCount)}</span>
								</OperationalMatrix.RowHeader>

								{#each columns as column (column.id)}
									{@const cell = getCell(row.source, column)}
									<OperationalMatrix.Cell
										{row}
										{column}
										readOnly
										ariaLabel={cell ? cellLabel(row.source.mos, cell) : averageLabel(row.source)}
									>
										{#if cell}
											<ReadinessBand.Cell tier={cell.tier} percent={cell.readinessPercent} />
										{:else}
											<ReadinessBand.Cell tier={row.source.averageTier} percent={row.source.averageReadinessPercent} />
										{/if}
									</OperationalMatrix.Cell>
								{/each}
							</OperationalMatrix.Row>
						{/each}
					</OperationalMatrix.Body>
				</OperationalMatrix.Table>
			</OperationalMatrix.Viewport>
		</OperationalMatrix.Root>

		<div class="border-t pt-3">
			<ReadinessBand.Legend />
		</div>
	{/if}
</ReportWorkspace.Section>
