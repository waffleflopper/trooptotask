<script lang="ts">
	import type { OnboardingPageContext } from '../contexts/OnboardingPageContext.svelte';
	import {
		describeCell,
		type MatrixCell,
		type MatrixColumn,
		type MatrixGrid,
		type MatrixRow
	} from '../onboardingMatrix';
	import type { OnboardingStepType } from '../onboarding.types';
	import { clockLabel } from '../onboardingStatus';
	import { Button } from '$lib/components/ui/button';
	import * as OperationalMatrix from '$lib/components/ui/operational-matrix';
	import Check from '@lucide/svelte/icons/check';

	interface Props {
		ctx: OnboardingPageContext;
		grid: MatrixGrid;
		selected: { packetId: string; columnId: string } | null;
		onOpenCell: (packetId: string, columnId: string) => void;
	}

	let { ctx, grid, selected, onOpenCell }: Props = $props();

	const TYPE_LABELS: Record<OnboardingStepType, string> = {
		checkbox: 'check',
		paperwork: 'paper',
		training: 'training'
	};
	const READ_ONLY_REASON = "Read only. You can't manage onboarding for this Soldier.";
	const MISSING_REASON = 'Not on this packet yet. Sync the packet to add it.';
	const CELL_BUTTON =
		'[&_[data-slot=operational-matrix-cell-trigger]]:flex [&_[data-slot=operational-matrix-cell-trigger]]:size-full [&_[data-slot=operational-matrix-cell-trigger]]:items-center [&_[data-slot=operational-matrix-cell-trigger]]:justify-center [&_[data-slot=operational-matrix-cell-trigger]]:focus-visible:outline-hidden [&_[data-slot=operational-matrix-cell-trigger]]:focus-visible:ring-2 [&_[data-slot=operational-matrix-cell-trigger]]:focus-visible:ring-ring [&_[data-slot=operational-matrix-cell-trigger]]:focus-visible:ring-inset [&_[data-slot=operational-matrix-cell-content]]:flex [&_[data-slot=operational-matrix-cell-content]]:size-full [&_[data-slot=operational-matrix-cell-content]]:items-center [&_[data-slot=operational-matrix-cell-content]]:justify-center';

	type RowModel = OperationalMatrix.OperationalMatrixRow;
	type ColumnModel = OperationalMatrix.OperationalMatrixColumn;

	const matrixRows = $derived<RowModel[]>(
		grid.rows.map((row) => ({ id: row.summary.packet.id, label: ctx.getPersonName(row.summary.packet.personnelId) }))
	);
	const matrixColumns = $derived<ColumnModel[]>(grid.columns.map((column) => ({ id: column.id, label: column.name })));
	const selectedCell = $derived(selected ? { rowId: selected.packetId, columnId: selected.columnId } : null);

	function canManage(row: MatrixRow): boolean {
		return ctx.canManageOnboarding(row.summary.packet);
	}

	function personMeta(row: MatrixRow): string {
		const personnelId = row.summary.packet.personnelId;
		return [ctx.getPersonGroupName(personnelId), ctx.getPerson(personnelId)?.mos].filter(Boolean).join(' · ');
	}

	function dayText(row: MatrixRow): string {
		const { clock } = row.summary;
		return clock.kind === 'day' ? String(clock.day) : `in ${clock.days}d`;
	}

	/** A checkbox step checks in place. Every other cell opens its popover. */
	function select(row: MatrixRow, column: MatrixColumn, cell: MatrixCell) {
		if (cell.kind === 'open' && cell.step.stepType === 'checkbox') void ctx.handleToggleCheckbox(cell.step);
		else onOpenCell(row.summary.packet.id, column.id);
	}

	function cellLabel(row: MatrixRow, column: MatrixColumn, cell: MatrixCell): string {
		const name = ctx.getPersonName(row.summary.packet.personnelId);
		const base = `${name}, ${describeCell(cell, column.name)}`;
		if (cell.kind === 'missing') return `${base}. Sync the packet to add it`;
		if (!canManage(row)) return `${base}. Read only`;
		if (cell.kind === 'open' && cell.step.stepType === 'checkbox') return `${base}. Select to mark complete`;
		return `${base}. Select for details`;
	}

	function cellTitle(row: MatrixRow, cell: MatrixCell): string | undefined {
		if (cell.kind === 'missing') return MISSING_REASON;
		return canManage(row) ? undefined : READ_ONLY_REASON;
	}
</script>

{#snippet rowHeader(row: MatrixRow, model: RowModel)}
	{@const packet = row.summary.packet}
	<OperationalMatrix.RowHeader
		row={model}
		sticky
		class="sticky left-0 z-10 h-14 w-44 min-w-44 border border-border bg-card px-3 py-1.5 text-left font-normal md:w-64 md:min-w-64"
	>
		<div class="flex items-center gap-2">
			<div class="grid min-w-0 flex-1">
				<span class="truncate text-sm font-semibold">{ctx.getPersonName(packet.personnelId)}</span>
				{#if row.ready && canManage(row)}
					<Button
						variant="link"
						size="none"
						class="h-auto justify-start p-0 text-xs"
						aria-label={`Close out ${ctx.getPersonName(packet.personnelId)}`}
						onclick={() => ctx.promptCompleteOnboarding(packet.id)}
					>
						All done · Close out
					</Button>
				{:else}
					<span class="truncate text-xs text-muted-foreground">{personMeta(row)}</span>
				{/if}
			</div>
			<span class="shrink-0 font-mono text-xs font-semibold" title={clockLabel(row.summary.clock)}>{dayText(row)}</span>
		</div>
	</OperationalMatrix.RowHeader>
{/snippet}

{#snippet cellMark(cell: MatrixCell)}
	{#if cell.kind === 'done'}
		<Check class="size-4 text-muted-foreground" aria-hidden="true" />
	{:else if cell.kind === 'open'}
		<span aria-hidden="true" class="size-3.5 rounded-xs border-[1.5px] border-muted-foreground"></span>
	{:else if cell.kind === 'stage'}
		<span class="grid justify-items-center leading-tight" aria-hidden="true">
			<span class="font-mono text-xs font-semibold">{cell.index}/{cell.of}</span>
			{#if cell.stalled}
				<span class="font-mono text-xs text-warning-foreground">{cell.days}d</span>
			{/if}
		</span>
	{:else}
		<span aria-hidden="true" class="text-muted-foreground">–</span>
	{/if}
{/snippet}

<OperationalMatrix.Root rows={matrixRows} columns={matrixColumns} {selectedCell}>
	<OperationalMatrix.Viewport
		ariaLabel={`${grid.template.name} packet matrix`}
		class="rounded-lg border border-border bg-card"
	>
		<OperationalMatrix.Table
			ariaLabel={`${grid.template.name} packet`}
			class={['min-w-max table-fixed text-sm', CELL_BUTTON]}
		>
			<OperationalMatrix.Header>
				<OperationalMatrix.HeaderRow>
					<OperationalMatrix.CornerCell
						sticky
						class="sticky left-0 z-20 w-44 min-w-44 border-r border-b border-foreground bg-card px-3 py-3 text-left md:w-64 md:min-w-64"
					>
						<span
							class="flex items-end justify-between font-mono text-xs font-medium uppercase tracking-wider text-muted-foreground"
						>
							<span>Soldier</span>
							<span>Day</span>
						</span>
					</OperationalMatrix.CornerCell>
					{#each grid.columns as column, index (column.id)}
						<OperationalMatrix.ColumnHeader
							column={matrixColumns[index]}
							title={column.name}
							class={[
								'w-18 min-w-18 border-b border-l border-foreground px-1 py-3 align-bottom font-normal',
								column.stalled > 0 && 'bg-warning-muted'
							]}
						>
							<span class="grid justify-items-center gap-0.5 text-center">
								<span class="line-clamp-2 text-[0.8125rem] leading-tight font-semibold">{column.name}</span>
								<span class="font-mono text-xs text-muted-foreground">{TYPE_LABELS[column.stepType]}</span>
							</span>
						</OperationalMatrix.ColumnHeader>
					{/each}
				</OperationalMatrix.HeaderRow>
			</OperationalMatrix.Header>

			<OperationalMatrix.Body>
				{#each grid.rows as row, rowIndex (row.summary.packet.id)}
					<OperationalMatrix.Row row={matrixRows[rowIndex]} class="h-14">
						{@render rowHeader(row, matrixRows[rowIndex])}
						{#if row.ready}
							<td
								colspan={grid.columns.length}
								class="border border-border bg-success-muted px-3 text-sm text-success-foreground"
							>
								<span class="flex items-center justify-center gap-2">
									<Check class="size-4" aria-hidden="true" />
									All {row.summary.total} steps done
								</span>
							</td>
						{:else}
							{#each grid.columns as column, index (column.id)}
								{@const cell = row.cells[index]}
								{@const stalled = cell.kind === 'stage' && cell.stalled}
								<OperationalMatrix.Cell
									row={matrixRows[rowIndex]}
									column={matrixColumns[index]}
									readOnly={cell.kind === 'missing' || !canManage(row)}
									ariaLabel={cellLabel(row, column, cell)}
									title={cellTitle(row, cell)}
									onSelect={() => select(row, column, cell)}
									class={[
										'h-14 border border-border p-0 text-center',
										stalled
											? 'bg-warning-muted ring-1 ring-warning ring-inset'
											: column.stalled > 0 && 'bg-warning-muted/40'
									]}
								>
									{@render cellMark(cell)}
								</OperationalMatrix.Cell>
							{/each}
						{/if}
					</OperationalMatrix.Row>
				{/each}
			</OperationalMatrix.Body>

			<tfoot>
				<tr class="h-14 bg-muted">
					<th
						scope="row"
						class="sticky left-0 z-10 border border-t-foreground border-border bg-muted px-3 text-left font-mono text-xs font-medium uppercase tracking-wider text-muted-foreground"
					>
						Open on step
					</th>
					{#each grid.columns as column (column.id)}
						<td
							class={[
								'border border-t-foreground border-border px-1 text-center',
								column.stalled > 0 && 'bg-warning-muted'
							]}
						>
							<span class="sr-only">
								{column.name}: {column.open} open{column.stalled > 0 ? `, ${column.stalled} stalled` : ''}
							</span>
							<span aria-hidden="true" class="grid justify-items-center leading-tight">
								<span class={['font-heading text-xl font-semibold', column.stalled > 0 && 'text-warning-foreground']}>
									{column.open}
								</span>
								{#if column.stalled > 0}
									<span class="font-mono text-xs text-warning-foreground">{column.stalled} stalled</span>
								{/if}
							</span>
						</td>
					{/each}
				</tr>
			</tfoot>
		</OperationalMatrix.Table>
	</OperationalMatrix.Viewport>
</OperationalMatrix.Root>
