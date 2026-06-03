<script lang="ts">
	import { resolve } from '$app/paths';
	import Check from '@lucide/svelte/icons/check';
	import CircleQuestionMark from '@lucide/svelte/icons/circle-question-mark';
	import Minus from '@lucide/svelte/icons/minus';
	import OctagonX from '@lucide/svelte/icons/octagon-x';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import type {
		CriticalTasksSettingsInput,
		IctStatus,
		IctTask,
		PersonnelIctCompletion
	} from '$features/critical-tasks/criticalTasks.types';
	import {
		buildCriticalTasksMatrix,
		type CriticalTasksMatrixCell,
		type CriticalTasksMatrixRow
	} from '$features/critical-tasks/utils/criticalTasksMatrix';
	import * as OperationalMatrix from '$lib/components/ui/operational-matrix';
	import { CriticalTaskStatusBadge } from '$lib/components/ui/requirement-status-badge';
	import type { Group } from '$lib/stores/groups.svelte';
	import type { Personnel } from '$lib/types';

	type IctMatrixViewMode = 'alphabetical' | 'by-group';

	type MatrixRow = Omit<OperationalMatrix.OperationalMatrixRow, 'meta'> & {
		source: CriticalTasksMatrixRow;
	};

	type MatrixColumn = Omit<OperationalMatrix.OperationalMatrixColumn, 'meta'> & {
		source: IctTask;
	};

	interface Props {
		orgId?: string;
		personnel: Personnel[];
		tasks: IctTask[];
		completions: PersonnelIctCompletion[];
		groups?: Group[];
		settings?: CriticalTasksSettingsInput | null;
		selectedGroupId?: string;
		selectedGroupFilter?: string;
		gapsOnly?: boolean;
		viewMode?: IctMatrixViewMode;
		asOf?: string | Date;
		orgName?: string;
		canEdit?: boolean;
		onSelectCell?: (selection: {
			person: Personnel;
			task: IctTask;
			completion: PersonnelIctCompletion | undefined;
		}) => void;
	}

	let {
		orgId = '',
		personnel,
		tasks,
		completions,
		groups = [],
		settings = null,
		selectedGroupId = '',
		selectedGroupFilter = '',
		gapsOnly = false,
		viewMode = 'by-group',
		asOf,
		orgName = 'Unassigned',
		canEdit = false,
		onSelectCell
	}: Props = $props();

	const matrix = $derived(
		buildCriticalTasksMatrix({
			personnel,
			tasks,
			completions,
			groups,
			settings,
			selectedGroupId,
			selectedGroupFilter,
			gapsOnly,
			asOf,
			orgName
		})
	);

	const statusLabels: Record<IctStatus, string> = {
		current: 'current',
		'expiring-soon': 'expiring soon',
		expired: 'expired',
		'not-recorded': 'not recorded'
	};

	const matrixColumns = $derived<MatrixColumn[]>(
		matrix.tasks.map((task) => ({
			id: task.id,
			label: `${task.taskCode} ${task.title}`,
			source: task
		}))
	);
	const visibleRows = $derived(viewMode === 'alphabetical' ? matrix.alphabeticalRows : matrix.rows);
	const matrixRows = $derived<MatrixRow[]>(visibleRows.map(toMatrixRow));
	const groupedMatrixRows = $derived.by(() =>
		viewMode === 'alphabetical'
			? []
			: matrix.groups.map((group) => ({
					group: {
						id: group.key,
						label: group.label,
						rowIds: group.rows.map((row) => row.person.id)
					},
					readinessPercent: group.readinessPercent,
					rows: group.rows.map(toMatrixRow)
				}))
	);
	const ICT_MATRIX_ROW_HEIGHT = 72;
	const ICT_MATRIX_GROUP_HEIGHT = 32;
	const ICT_MATRIX_FALLBACK_VIEWPORT_HEIGHT = 640;
	const ICT_MATRIX_OVERSCAN_PX = ICT_MATRIX_ROW_HEIGHT * 2;

	let scrollTop = $state(0);
	let measuredViewportHeight = $state(0);
	const viewportHeight = $derived(measuredViewportHeight || ICT_MATRIX_FALLBACK_VIEWPORT_HEIGHT);
	const totalColumns = $derived(matrixColumns.length + 1);
	const virtualItems = $derived<OperationalMatrix.VirtualMatrixItem<MatrixRow>[]>(
		viewMode === 'alphabetical'
			? matrixRows.map((row) => ({
					kind: 'row',
					key: row.id,
					row,
					height: ICT_MATRIX_ROW_HEIGHT
				}))
			: groupedMatrixRows.flatMap((groupBlock) => [
					{
						kind: 'group' as const,
						key: groupBlock.group.id,
						group: {
							...groupBlock.group,
							meta: {
								readinessPercent: groupBlock.readinessPercent,
								rowCount: groupBlock.rows.length
							}
						},
						height: ICT_MATRIX_GROUP_HEIGHT
					},
					...groupBlock.rows.map((row) => ({
						kind: 'row' as const,
						key: `${groupBlock.group.id}:${row.id}`,
						row,
						height: ICT_MATRIX_ROW_HEIGHT
					}))
				])
	);
	const virtualWindow = $derived(
		OperationalMatrix.buildVirtualMatrixWindow(virtualItems, {
			scrollTop,
			viewportHeight,
			overscanPx: ICT_MATRIX_OVERSCAN_PX
		})
	);

	const legendItems: Array<{ status: IctStatus | 'not-required'; label: string }> = [
		{ status: 'current', label: 'Current' },
		{ status: 'expiring-soon', label: 'Expiring Soon' },
		{ status: 'expired', label: 'Expired' },
		{ status: 'not-recorded', label: 'Not Recorded' },
		{ status: 'not-required', label: 'Not Required for MOS' }
	];

	function toMatrixRow(row: CriticalTasksMatrixRow): MatrixRow {
		return {
			id: row.person.id,
			label: personName(row.person),
			source: row
		};
	}

	function personName(person: Personnel): string {
		return `${person.lastName}, ${person.firstName}`;
	}

	function readinessTone(percent: number, applicableCount: number): string {
		if (applicableCount === 0) return 'bg-muted';
		if (percent < 65) return 'bg-danger';
		if (percent >= 80) return 'bg-success';
		return 'bg-warning';
	}

	function cellAriaLabel(person: Personnel, cell: CriticalTasksMatrixCell): string {
		if (!cell.applicable) {
			return `${person.lastName} ${cell.task.taskCode}: not applicable`;
		}

		return `${person.lastName} ${cell.task.taskCode}: ${statusLabels[cell.statusInfo.status]}. ${cell.detailLabel}`;
	}

	function handleCellClick(row: MatrixRow, column: MatrixColumn): void {
		if (!canEdit) return;

		const cell = row.source.cellsByTaskId.get(column.source.id);
		if (!cell || !cell.applicable) return;

		onSelectCell?.({
			person: row.source.person,
			task: cell.task,
			completion: cell.completion
		});
	}

	function completionSummary(cell: CriticalTasksMatrixCell): string {
		if (!cell.completion) return 'No completion';
		if (cell.statusInfo.expirationDate) return `Expires ${cell.statusInfo.expirationDate}`;
		return `Completed ${cell.completion.completedAt}`;
	}

	function cellStatusClass(status: IctStatus): string {
		if (status === 'current') return 'bg-success-muted text-success-foreground';
		if (status === 'expiring-soon') return 'bg-warning-muted text-warning-foreground';
		if (status === 'expired') return 'bg-danger-muted text-danger-foreground';
		return 'bg-muted text-muted-foreground';
	}

	function handleViewportScroll(event: Event): void {
		scrollTop = (event.currentTarget as HTMLElement).scrollTop;
	}

	function groupMetaNumber(
		group: OperationalMatrix.OperationalMatrixRowGroup,
		key: 'readinessPercent' | 'rowCount'
	): number {
		const value = group.meta?.[key];
		return typeof value === 'number' ? value : 0;
	}
</script>

{#snippet rowHeader(row: MatrixRow)}
	<OperationalMatrix.RowHeader
		{row}
		sticky
		class="sticky left-0 z-10 h-[72px] w-64 min-w-56 max-w-64 border border-border bg-card px-3 py-2 text-left align-middle"
	>
		{#if orgId}
			<a
				href={resolve('/org/[orgId]/critical-tasks/[personnelId]', {
					orgId,
					personnelId: row.source.person.id
				})}
				class="grid gap-2 text-foreground no-underline hover:text-primary"
			>
				<span class="flex min-w-0 items-baseline gap-3">
					<span class="w-10 shrink-0 font-mono text-xs font-semibold uppercase tracking-[0.08em] text-amber-700">
						{row.source.person.rank}
					</span>
					<span class="min-w-0">
						<span class="block truncate text-sm font-medium">{row.label}</span>
						<span class="block truncate font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
							{row.source.person.mos || 'No MOS'}
						</span>
					</span>
				</span>
				<span
					class="grid grid-cols-[auto_minmax(3.5rem,1fr)_2.25rem] items-center gap-2 border-t border-dashed border-border pt-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground"
					aria-label={`${personName(row.source.person)} readiness ${row.source.readinessPercent}%`}
				>
					<span>RDY</span>
					<span class="h-1 overflow-hidden rounded bg-muted" aria-hidden="true">
						<span
							class={`block h-full ${readinessTone(row.source.readinessPercent, row.source.applicableCount)}`}
							style:width={`${row.source.readinessPercent}%`}
						></span>
					</span>
					<span class="text-right text-foreground">{row.source.readinessPercent}%</span>
				</span>
			</a>
		{:else}
			<span class="flex min-w-0 items-baseline gap-3">
				<span class="w-10 shrink-0 font-mono text-xs font-semibold uppercase tracking-[0.08em] text-amber-700">
					{row.source.person.rank}
				</span>
				<span class="min-w-0">
					<span class="block truncate text-sm font-medium">{row.label}</span>
					<span class="block truncate font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
						{row.source.person.mos || 'No MOS'}
					</span>
				</span>
			</span>
		{/if}
	</OperationalMatrix.RowHeader>
{/snippet}

{#snippet matrixRow(row: MatrixRow, virtualIndex?: number)}
	<OperationalMatrix.Row {row} {virtualIndex} class="h-[72px] bg-card hover:bg-muted/20">
		{@render rowHeader(row)}
		{#each matrixColumns as column (column.id)}
			{@const cell = row.source.cellsByTaskId.get(column.source.id)}
			<OperationalMatrix.Cell
				{row}
				{column}
				disabled={!cell?.applicable}
				readOnly={!cell?.applicable}
				ariaLabel={cell
					? cellAriaLabel(row.source.person, cell)
					: `${row.source.person.lastName} ${column.source.taskCode}: not applicable`}
				onSelect={() => handleCellClick(row, column)}
				class="h-10 w-12 min-w-12 border border-border bg-card p-0"
			>
				{#if cell?.applicable}
					<span
						class={`grid h-10 w-full place-items-center overflow-hidden ${cellStatusClass(cell.statusInfo.status)}`}
						data-status={cell.statusInfo.status}
					>
						{#if cell.statusInfo.status === 'current'}
							<Check class="size-4" aria-hidden="true" />
						{:else if cell.statusInfo.status === 'expiring-soon'}
							<TriangleAlert class="size-4" aria-hidden="true" />
						{:else if cell.statusInfo.status === 'expired'}
							<OctagonX class="size-4" aria-hidden="true" />
						{:else}
							<CircleQuestionMark class="size-4" aria-hidden="true" />
						{/if}
						<span class="sr-only">
							{completionSummary(cell)}
						</span>
					</span>
				{:else}
					<span class="grid h-10 w-full place-items-center bg-muted text-muted-foreground/70">
						<Minus class="size-4" aria-hidden="true" />
						<span class="sr-only">Not required</span>
					</span>
				{/if}
			</OperationalMatrix.Cell>
		{/each}
	</OperationalMatrix.Row>
{/snippet}

<OperationalMatrix.Root rows={matrixRows} columns={matrixColumns} class="grid h-full min-h-0 gap-3">
	<div class="flex flex-wrap items-center gap-2" aria-label="Critical Tasks status legend">
		{#each legendItems as item (item.status)}
			<CriticalTaskStatusBadge status={item.status} />
		{/each}
	</div>

	<OperationalMatrix.Viewport
		ariaLabel="Critical Tasks matrix viewport"
		class="h-full min-h-0 rounded-lg border border-border bg-card"
		data-testid="critical-tasks-matrix-scroll"
		virtualized
		onViewportHeightChange={(height) => (measuredViewportHeight = height)}
		onscroll={handleViewportScroll}
	>
		<OperationalMatrix.Table
			ariaLabel="Critical Tasks readiness matrix"
			data-testid="critical-tasks-matrix-table"
			class="min-w-max table-fixed text-sm [&_[data-matrix-column-header]]:border [&_[data-matrix-column-header]]:border-border [&_[data-matrix-column-header]]:bg-muted [&_[data-matrix-column-header]]:font-mono [&_[data-matrix-column-header]]:text-[9px] [&_[data-matrix-column-header]]:font-semibold [&_[data-matrix-column-header]]:uppercase [&_[data-matrix-column-header]]:shadow-sm [&_[data-matrix-cell]]:border [&_[data-matrix-cell]]:border-border [&_[data-matrix-cell]]:p-0 [&_[data-slot=operational-matrix-cell-content]]:flex [&_[data-slot=operational-matrix-cell-content]]:h-10 [&_[data-slot=operational-matrix-cell-content]]:w-full [&_[data-slot=operational-matrix-cell-trigger]]:flex [&_[data-slot=operational-matrix-cell-trigger]]:h-10 [&_[data-slot=operational-matrix-cell-trigger]]:w-full [&_[data-slot=operational-matrix-cell-trigger]]:focus-visible:outline-hidden [&_[data-slot=operational-matrix-cell-trigger]]:focus-visible:ring-2 [&_[data-slot=operational-matrix-cell-trigger]]:focus-visible:ring-ring [&_[data-slot=operational-matrix-cell-trigger]]:focus-visible:ring-inset [&_[data-selected=true]]:ring-2 [&_[data-selected=true]]:ring-foreground [&_[data-selected=true]]:ring-inset"
		>
			<OperationalMatrix.Header>
				<OperationalMatrix.HeaderRow>
					<OperationalMatrix.CornerCell
						sticky
						class="sticky left-0 top-0 z-30 w-64 min-w-56 bg-muted px-3 py-2 text-left font-mono text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground"
					>
						Soldier
					</OperationalMatrix.CornerCell>
					{#each matrixColumns as column (column.id)}
						<OperationalMatrix.ColumnHeader
							{column}
							sticky
							orientation="vertical"
							aria-label={column.label}
							title={column.source.title}
							class="sticky top-0 z-20 h-52 w-14 min-w-14 max-w-14 bg-muted"
						>
							<span class="grid w-40 gap-0.5 text-center">
								<span class="truncate text-[9px] font-bold leading-none text-foreground">
									{column.source.taskCode}
								</span>
								<span
									class="line-clamp-2 whitespace-normal text-[8px] font-medium normal-case leading-tight tracking-normal text-muted-foreground"
								>
									{column.source.title}
								</span>
							</span>
						</OperationalMatrix.ColumnHeader>
					{/each}
				</OperationalMatrix.HeaderRow>
			</OperationalMatrix.Header>

			<OperationalMatrix.Body>
				{#if visibleRows.length === 0}
					<tr>
						<td class="px-4 py-8 text-center text-sm text-muted-foreground" colspan={totalColumns}>
							No personnel match the current Critical Tasks filters.
						</td>
					</tr>
				{:else}
					{#if virtualWindow.topSpacerHeight > 0}
						<tr aria-hidden="true" data-matrix-spacer="top">
							<td colspan={totalColumns} style:height={`${virtualWindow.topSpacerHeight}px`}></td>
						</tr>
					{/if}
					{#each virtualWindow.visibleItems as item (item.key)}
						{#if item.kind === 'group'}
							<OperationalMatrix.RowGroup
								group={item.group}
								columnSpan={totalColumns}
								virtualIndex={item.virtualIndex}
								class="h-8 bg-muted/50 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground [&_th]:px-3 [&_th]:py-1.5 [&_th]:text-left"
							>
								{item.group.label}
								<span class="ml-2 normal-case tracking-normal">
									{groupMetaNumber(item.group, 'rowCount')} personnel ({groupMetaNumber(
										item.group,
										'readinessPercent'
									)}% Readiness)
								</span>
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
				{/if}
			</OperationalMatrix.Body>
		</OperationalMatrix.Table>
	</OperationalMatrix.Viewport>
</OperationalMatrix.Root>
