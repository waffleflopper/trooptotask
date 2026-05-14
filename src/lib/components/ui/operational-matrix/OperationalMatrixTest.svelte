<script lang="ts">
	import * as OperationalMatrix from './index.js';
	import type {
		OperationalMatrixCellSelection,
		OperationalMatrixColumn,
		OperationalMatrixRow,
		OperationalMatrixRowGroup
	} from './index.js';

	type TestRow = OperationalMatrixRow & {
		meta: {
			role: string;
			team: string;
		};
	};

	type TestColumn = OperationalMatrixColumn & {
		meta: {
			period: string;
		};
	};

	const rows: TestRow[] = [
		{ id: 'avery', label: 'Avery Brooks', meta: { role: 'Section lead', team: 'HQ' } },
		{ id: 'maya', label: 'Maya Chen', readOnly: true, meta: { role: 'Training NCO', team: 'A Co' } },
		{ id: 'jon', label: 'Jon Bell', disabled: true, meta: { role: 'Supply', team: 'B Co' } }
	];

	const columns: TestColumn[] = [
		{ id: 'alpha', label: 'Alpha window', meta: { period: 'Week 1' } },
		{ id: 'bravo', label: 'Bravo window', meta: { period: 'Week 2' } }
	];

	const rowGroups: OperationalMatrixRowGroup[] = [
		{ id: 'hq', label: 'Headquarters', rowIds: ['avery'] },
		{ id: 'line', label: 'Line companies', rowIds: ['maya', 'jon'] }
	];

	let selectedCell = $state({ rowId: 'avery', columnId: 'alpha' });
	let selectedPayload = $state('none');

	function handleCellSelect(selection: OperationalMatrixCellSelection) {
		const row = selection.row as TestRow;
		const column = selection.column as TestColumn;
		selectedPayload = `${selection.rowId}:${selection.columnId}:${selection.source}:${row.meta.role}:${column.meta.period}`;
		selectedCell = { rowId: selection.rowId, columnId: selection.columnId };
	}
</script>

<p data-testid="selected-payload">{selectedPayload}</p>

<OperationalMatrix.Root {rows} {columns} {rowGroups} {selectedCell} onCellSelect={handleCellSelect}>
	<OperationalMatrix.Viewport ariaLabel="Operational matrix test viewport">
		<OperationalMatrix.Table ariaLabel="Operational matrix test table">
			<OperationalMatrix.Header>
				<OperationalMatrix.HeaderRow>
					<OperationalMatrix.CornerCell>Matrix</OperationalMatrix.CornerCell>
					<OperationalMatrix.ColumnGroup label="Planning windows" columnSpan={2} />
				</OperationalMatrix.HeaderRow>
				<OperationalMatrix.HeaderRow>
					<OperationalMatrix.CornerCell>Personnel</OperationalMatrix.CornerCell>
					{#each columns as column (column.id)}
						<OperationalMatrix.ColumnHeader {column} orientation={column.id === 'alpha' ? 'vertical' : 'horizontal'}>
							{column.label}
						</OperationalMatrix.ColumnHeader>
					{/each}
				</OperationalMatrix.HeaderRow>
			</OperationalMatrix.Header>

			<OperationalMatrix.Body>
				{#each rowGroups as group (group.id)}
					<OperationalMatrix.RowGroup {group}>{group.label}</OperationalMatrix.RowGroup>

					{#each rows.filter((row) => group.rowIds.includes(row.id)) as row (row.id)}
						<OperationalMatrix.Row {row}>
							<OperationalMatrix.RowHeader {row}>
								<span>{row.label}</span>
								<span>{row.meta.role}</span>
							</OperationalMatrix.RowHeader>

							{#each columns as column (column.id)}
								<OperationalMatrix.Cell {row} {column} ariaLabel={`${row.label} ${column.label} planning action`}>
									<span>{row.id === 'avery' && column.id === 'alpha' ? 'Assigned' : 'Open'}</span>
								</OperationalMatrix.Cell>
							{/each}
						</OperationalMatrix.Row>
					{/each}
				{/each}
			</OperationalMatrix.Body>
		</OperationalMatrix.Table>
	</OperationalMatrix.Viewport>
</OperationalMatrix.Root>
