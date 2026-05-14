<script lang="ts">
	import { AlertTriangle } from '@lucide/svelte';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import * as OperationalMatrix from '$lib/components/ui/operational-matrix/index.js';
	import type { OperationalMatrixColumn, OperationalMatrixRow } from '$lib/components/ui/operational-matrix/index.js';
	import * as PageShell from '$lib/components/ui/page-shell/index.js';
	import { cn } from '$lib/utils.js';
	import WarningSummary from './WarningSummary.svelte';
	import type {
		DA6MatrixCell,
		DA6MatrixColumn,
		DA6MatrixFooterRow,
		DA6MatrixMetadataItem,
		DA6MatrixMode,
		DA6MatrixRow
	} from './types.js';

	type Props = {
		title: string;
		description?: string;
		mode?: DA6MatrixMode;
		rows: DA6MatrixRow[];
		columns: DA6MatrixColumn[];
		cells: Record<string, Record<string, DA6MatrixCell>>;
		footerRows?: DA6MatrixFooterRow[];
		metadata?: DA6MatrixMetadataItem[];
		warning?: string;
	};

	let {
		title,
		description,
		mode = 'draft',
		rows,
		columns,
		cells,
		footerRows = [],
		metadata = [],
		warning
	}: Props = $props();

	const matrixRows = $derived(rows.map((row): OperationalMatrixRow => ({ id: row.id, label: row.label, meta: row })));
	const matrixColumns = $derived(
		columns.map(
			(column): OperationalMatrixColumn => ({
				id: column.id,
				label: column.label ?? `${column.weekday} ${column.date}`,
				meta: column
			})
		)
	);

	function cellFor(row: DA6MatrixRow, column: DA6MatrixColumn): DA6MatrixCell {
		return (
			cells[row.id]?.[column.id] ?? {
				display: '-',
				kind: 'not-assigned',
				ariaLabel: `${row.label} ${column.weekday} ${column.date}: not assigned`,
				chargeable: false,
				count: null,
				reason: null
			}
		);
	}

	function cellClass(cell: DA6MatrixCell): string {
		if (cell.kind === 'assigned') return 'bg-success-muted text-success-foreground';
		if (cell.kind === 'manual-override') return 'border-warning bg-warning-muted text-warning-foreground';
		if (cell.kind === 'exempt') return 'bg-muted text-muted-foreground';
		if (cell.kind === 'blocked') return 'bg-danger-muted text-danger-foreground';
		if (cell.kind === 'unresolved') return 'bg-warning-muted text-warning-foreground';
		return 'text-muted-foreground';
	}

	function footerValue(row: DA6MatrixFooterRow, column: DA6MatrixColumn): string {
		return String(row.values[column.id] ?? '-');
	}
</script>

<section class="grid min-w-0 gap-4 rounded-lg border bg-card p-4 text-card-foreground" aria-label={title}>
	<div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
		<div class="grid gap-1">
			<h3 class="text-lg font-semibold">{title}</h3>
			{#if description}
				<p class="text-sm text-muted-foreground">{description}</p>
			{/if}
		</div>
		<Badge variant={mode === 'draft' ? 'warning' : 'success'}>{mode === 'draft' ? 'Draft Preview' : 'Official'}</Badge>
	</div>

	{#if metadata.length > 0}
		<div class="grid gap-3 rounded-lg border p-3 sm:grid-cols-2 lg:grid-cols-4">
			{#each metadata as item (item.label)}
				<PageShell.FactRow layout="stack" label={item.label} value={item.value} />
			{/each}
		</div>
	{/if}

	{#if warning}
		<WarningSummary tone="warning" title="DA6 count note" description={warning} actionLabel="Review Rules" />
	{/if}

	<OperationalMatrix.Root rows={matrixRows} columns={matrixColumns} readOnly>
		<OperationalMatrix.Viewport ariaLabel={`${title} viewport`} class="rounded-lg border bg-card">
			<OperationalMatrix.Table
				ariaLabel={title}
				class="min-w-max table-fixed text-sm [&_[data-matrix-cell]]:h-10 [&_[data-matrix-cell]]:w-12 [&_[data-matrix-cell]]:border [&_[data-matrix-cell]]:border-border [&_[data-matrix-cell]]:p-0 [&_[data-matrix-column-header]]:border [&_[data-matrix-column-header]]:border-border [&_[data-matrix-column-header]]:bg-muted/70 [&_[data-slot=operational-matrix-cell-content]]:grid [&_[data-slot=operational-matrix-cell-content]]:h-10 [&_[data-slot=operational-matrix-cell-content]]:place-items-center"
			>
				<OperationalMatrix.Header>
					<OperationalMatrix.HeaderRow>
						<OperationalMatrix.CornerCell sticky class="sticky left-0 top-0 z-30 w-48 min-w-48 bg-muted px-3 text-left">
							Soldier
						</OperationalMatrix.CornerCell>
						{#each columns as column (column.id)}
							{@const operationalColumn = matrixColumns.find((item) => item.id === column.id) ?? matrixColumns[0]}
							<OperationalMatrix.ColumnHeader column={operationalColumn} sticky class="sticky top-0 z-20 bg-muted">
								<span class="grid min-w-12 place-items-center gap-0.5 text-center text-xs leading-tight">
									<span class="font-semibold">{column.weekday}</span>
									<span class="font-normal text-muted-foreground">{column.date}</span>
								</span>
							</OperationalMatrix.ColumnHeader>
						{/each}
					</OperationalMatrix.HeaderRow>
				</OperationalMatrix.Header>
				<OperationalMatrix.Body>
					{#each rows as row (row.id)}
						{@const operationalRow = matrixRows.find((item) => item.id === row.id) ?? matrixRows[0]}
						<OperationalMatrix.Row row={operationalRow} class="bg-card hover:bg-muted/20">
							<OperationalMatrix.RowHeader
								row={operationalRow}
								sticky
								class="sticky left-0 z-10 w-48 min-w-48 border bg-card px-3 py-2 text-left"
							>
								<span class="grid">
									<span class="truncate font-medium">{row.label}</span>
									{#if row.subtitle}
										<span class="text-xs text-muted-foreground">{row.subtitle}</span>
									{/if}
								</span>
							</OperationalMatrix.RowHeader>
							{#each columns as column (column.id)}
								{@const operationalColumn = matrixColumns.find((item) => item.id === column.id) ?? matrixColumns[0]}
								{@const cell = cellFor(row, column)}
								<OperationalMatrix.Cell
									row={operationalRow}
									column={operationalColumn}
									readOnly
									ariaLabel={cell.ariaLabel}
									class={cellClass(cell)}
								>
									<span class="font-mono text-xs font-semibold">{cell.display}</span>
								</OperationalMatrix.Cell>
							{/each}
						</OperationalMatrix.Row>
					{/each}

					{#each footerRows as footer (footer.label)}
						<OperationalMatrix.Row row={{ id: footer.label, label: footer.label, readOnly: true }} class="bg-muted/30">
							<OperationalMatrix.RowHeader
								row={{ id: footer.label, label: footer.label, readOnly: true }}
								sticky
								class="sticky left-0 z-10 w-48 min-w-48 border bg-muted px-3 py-2 text-left font-semibold"
							>
								{footer.label}
							</OperationalMatrix.RowHeader>
							{#each columns as column (column.id)}
								{@const operationalColumn = matrixColumns.find((item) => item.id === column.id) ?? matrixColumns[0]}
								<OperationalMatrix.Cell
									row={{ id: footer.label, label: footer.label, readOnly: true }}
									column={operationalColumn}
									readOnly
									ariaLabel={`${footer.label} for ${column.weekday} ${column.date}: ${footerValue(footer, column)}`}
									class="bg-muted/30 text-foreground"
								>
									<span class="font-mono text-xs font-semibold">{footerValue(footer, column)}</span>
								</OperationalMatrix.Cell>
							{/each}
						</OperationalMatrix.Row>
					{/each}
				</OperationalMatrix.Body>
			</OperationalMatrix.Table>
		</OperationalMatrix.Viewport>
	</OperationalMatrix.Root>

	<div class="flex flex-wrap gap-3 text-sm">
		<span class="inline-flex items-center gap-2">
			<span
				class={cn(
					'inline-flex min-w-7 items-center justify-center rounded-sm border px-1.5 py-1 font-mono text-[10px] font-semibold',
					cellClass({ display: 'X', kind: 'assigned', ariaLabel: 'Assigned' })
				)}>X</span
			>
			<span class="text-sm text-muted-foreground">Assigned duty.</span>
		</span>
		<span class="inline-flex items-center gap-2">
			<span
				class="inline-flex min-w-7 items-center justify-center rounded-sm border px-1.5 py-1 font-mono text-[10px] font-semibold text-muted-foreground"
				>1-30</span
			>
			<span class="text-sm text-muted-foreground">Available and not selected; visible DA6 count.</span>
		</span>
		<span class="inline-flex items-center gap-2">
			<span
				class={cn(
					'inline-flex min-w-7 items-center justify-center rounded-sm border px-1.5 py-1 font-mono text-[10px] font-semibold',
					cellClass({ display: 'A', kind: 'exempt', ariaLabel: 'Exempt' })
				)}>A/EX</span
			>
			<span class="text-sm text-muted-foreground">Authorized absence or exempt; not chargeable.</span>
		</span>
		<span class="inline-flex items-center gap-2">
			<span
				class={cn(
					'inline-flex min-w-7 items-center justify-center rounded-sm border px-1.5 py-1 font-mono text-[10px] font-semibold',
					cellClass({ display: 'D', kind: 'blocked', ariaLabel: 'Blocked' })
				)}>D/U</span
			>
			<span class="text-sm text-muted-foreground">Blocked but chargeable; count advances.</span>
		</span>
		<span class="inline-flex items-center gap-2">
			<span
				class={cn(
					'inline-flex min-w-7 items-center justify-center rounded-sm border px-1.5 py-1 font-mono text-[10px] font-semibold',
					cellClass({ display: 'A*', kind: 'manual-override', ariaLabel: 'Override' })
				)}
			>
				A*
			</span>
			<span class="text-sm text-muted-foreground">Manual override requiring review.</span>
		</span>
		<span class="inline-flex items-center gap-2">
			<AlertTriangle class="size-4 text-warning-foreground" />
			<span class="text-sm text-muted-foreground">Status is labeled, not color-only.</span>
		</span>
	</div>
</section>
