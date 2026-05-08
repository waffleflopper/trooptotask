<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import * as OperationalMatrix from './index.js';
	import type { OperationalMatrixLegendItem, OperationalMatrixState } from './index.js';

	type Column = { id: string; label: string; description: string; short: string };
	type Row = {
		id: string;
		name: string;
		group: string;
		cells: Array<{ columnId: string; state: OperationalMatrixState; label: string; value: string; detail: string }>;
	};

	let actionResult = $state('none');

	const columns: Column[] = [
		{ id: 'land-nav', label: 'Land Navigation', description: 'Required annual task', short: 'LAND' },
		{ id: 'medical', label: 'Combat Lifesaver', description: 'Medical readiness', short: 'CLS' },
		{ id: 'da6', label: 'DA6 12 May', description: 'Duty roster order', short: '12 MAY' }
	];

	const rows: Row[] = [
		{
			id: 'avery',
			name: 'Brooks, Avery',
			group: 'HQ',
			cells: [
				{
					columnId: 'land-nav',
					state: 'complete',
					label: 'Complete',
					value: '2026-04-12',
					detail: 'Current through 2027.'
				},
				{
					columnId: 'medical',
					state: 'warning',
					label: 'Expiring soon',
					value: '30 days',
					detail: 'Renewal due soon.'
				},
				{ columnId: 'da6', state: 'assigned', label: 'Assigned', value: 'X', detail: 'Assigned Staff Duty.' }
			]
		},
		{
			id: 'chen',
			name: 'Chen, Maya',
			group: 'A Co',
			cells: [
				{
					columnId: 'land-nav',
					state: 'expired',
					label: 'Expired',
					value: '2025-11-01',
					detail: 'Completion is past due.'
				},
				{ columnId: 'medical', state: 'incomplete', label: 'Incomplete', value: 'Missing', detail: 'No record found.' },
				{ columnId: 'da6', state: 'disabled', label: 'Unavailable', value: 'A', detail: 'Authorized absence.' }
			]
		}
	];

	const legend: OperationalMatrixLegendItem[] = [
		{ state: 'complete', label: 'Complete' },
		{ state: 'warning', label: 'Warning' },
		{ state: 'expired', label: 'Expired' },
		{ state: 'incomplete', label: 'Incomplete' },
		{ state: 'assigned', label: 'Assigned' },
		{ state: 'disabled', label: 'Unavailable' }
	];

	function cellFor(row: Row, column: Column) {
		return row.cells.find((cell) => cell.columnId === column.id)!;
	}
</script>

<OperationalMatrix.Root ariaLabel="Operational matrix test" density="compact">
	<OperationalMatrix.Toolbar ariaLabel="Operational matrix controls">
		<Button variant="outline">Filters</Button>
		<Button variant="outline" disabled>Read only</Button>
	</OperationalMatrix.Toolbar>

	<OperationalMatrix.Legend items={legend} />

	<OperationalMatrix.Viewport ariaLabel="Training and DA6 matrix viewport" maxHeight="24rem">
		<OperationalMatrix.Table ariaLabel="Training and DA6 operational matrix">
			<OperationalMatrix.Header>
				<tr>
					<OperationalMatrix.Corner label="Soldier" />
					{#each columns as column (column.id)}
						<OperationalMatrix.ColumnHeader
							label={column.label}
							description={column.description}
							compactLabel={column.short}
						/>
					{/each}
				</tr>
			</OperationalMatrix.Header>
			<OperationalMatrix.Body>
				<OperationalMatrix.RowGroup label="Ready group" meta="2 personnel" colspan={columns.length + 1} />
				{#each rows as row (row.id)}
					<OperationalMatrix.Row>
						<OperationalMatrix.RowHeader label={row.name}>
							<span>{row.name}</span>
							<small>{row.group}</small>
						</OperationalMatrix.RowHeader>
						{#each columns as column (column.id)}
							{@const cell = cellFor(row, column)}
							<OperationalMatrix.Cell
								state={cell.state}
								label={cell.label}
								value={cell.value}
								detail={cell.detail}
								rowLabel={row.name}
								columnLabel={column.label}
								actionLabel={`Open ${row.name} ${column.label}`}
								labelVisibility={column.id === 'land-nav' ? 'hidden' : 'visible'}
								onSelect={() => (actionResult = `${row.id}:${column.id}`)}
							/>
						{/each}
					</OperationalMatrix.Row>
				{/each}
			</OperationalMatrix.Body>
		</OperationalMatrix.Table>
	</OperationalMatrix.Viewport>

	<OperationalMatrix.Loading rows={2} columns={3} label="Loading matrix preview" />
	<table>
		<tbody>
			<OperationalMatrix.Empty title="No matrix rows" description="Adjust filters and try again." colspan={4} />
		</tbody>
	</table>
</OperationalMatrix.Root>

<OperationalMatrix.Root ariaLabel="Read-only operational matrix" readOnly>
	<OperationalMatrix.Viewport ariaLabel="Read-only matrix viewport">
		<OperationalMatrix.Table ariaLabel="Read-only matrix">
			<OperationalMatrix.Header>
				<tr>
					<OperationalMatrix.Corner label="Soldier" />
					<OperationalMatrix.ColumnHeader label="Readiness note" />
				</tr>
			</OperationalMatrix.Header>
			<OperationalMatrix.Body>
				<OperationalMatrix.Row disabled>
					<OperationalMatrix.RowHeader label="Ortiz, Sam">Ortiz, Sam</OperationalMatrix.RowHeader>
					<OperationalMatrix.Cell
						state="info"
						label="Info"
						value="Needs review"
						rowLabel="Ortiz, Sam"
						columnLabel="Readiness note"
						readOnly
					/>
				</OperationalMatrix.Row>
			</OperationalMatrix.Body>
		</OperationalMatrix.Table>
	</OperationalMatrix.Viewport>
</OperationalMatrix.Root>

<p data-testid="matrix-action-result">{actionResult}</p>
