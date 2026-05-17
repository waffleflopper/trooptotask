<script lang="ts">
	import { SvelteMap } from 'svelte/reactivity';
	import type { Personnel } from '$lib/types';
	import type { TrainingType, PersonnelTraining } from '$features/training/training.types';
	import {
		getTrainingStatus,
		TRAINING_STATUS_SORT_ORDER,
		type TrainingStatusInfo
	} from '$features/training/utils/trainingStatus';
	import { getCellDisplayText } from '$features/training/utils/cellDisplayText';
	import type { TrainingStatus } from '$features/training/training.types';
	import * as OperationalMatrix from '$lib/components/ui/operational-matrix';
	import type { ColumnDef, GroupDef } from '$lib/components/ui/data-table';
	import { useDataTable } from '$lib/components/ui/data-table';
	import { Input } from '$lib/components/ui/input';
	import { TrainingStatusBadge, TrainingStatusCell } from '$lib/components/ui/requirement-status-badge';

	interface Props {
		personnel: Personnel[];
		trainingTypes: TrainingType[];
		trainings: PersonnelTraining[];
		onCellClick?: (person: Personnel, type: TrainingType, training: PersonnelTraining | undefined) => void;
		onPersonClick?: (person: Personnel) => void;
		showSearch?: boolean;
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
		onCellClick,
		onPersonClick,
		showSearch = false,
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
			return {
				key: type.id,
				header: type.name,
				value: (p: Personnel) => getCellMetadata(p, type).statusInfo.status,
				compare: (a: Personnel, b: Personnel) => {
					const aStatus = getCellMetadata(a, type).statusInfo.status;
					const bStatus = getCellMetadata(b, type).statusInfo.status;
					return TRAINING_STATUS_SORT_ORDER[aStatus] - TRAINING_STATUS_SORT_ORDER[bStatus];
				}
			};
		}
	});

	function sortIndicator(key: string): string {
		if (table.sortKey !== key) return '';
		return table.sortDirection === 'asc' ? ' ▲' : ' ▼';
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

	const cellMetadataLookup = $derived.by(() => {
		const map = new SvelteMap<string, TrainingCellMetadata>();
		for (const person of personnel) {
			for (const type of trainingTypes) {
				const key = createTrainingKey(person.id, type.id);
				const training = trainingLookup.get(key);
				const statusInfo = getTrainingStatus(training, type, person);
				map.set(key, {
					training,
					statusInfo,
					displayText: getCellDisplayText(statusInfo, training, type.expirationDateOnly)
				});
			}
		}
		return map;
	});

	function getCellMetadata(person: Personnel, type: TrainingType): TrainingCellMetadata {
		const key = createTrainingKey(person.id, type.id);
		const metadata = cellMetadataLookup.get(key);
		if (metadata) return metadata;

		const training = trainingLookup.get(key);
		const statusInfo = getTrainingStatus(training, type, person);
		return {
			training,
			statusInfo,
			displayText: getCellDisplayText(statusInfo, training, type.expirationDateOnly)
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

	const matrixRows = $derived<MatrixRow[]>(table.rows.map(toMatrixRow));
	const groupedMatrixRows = $derived.by(() => {
		if (table.groups.length === 0) return [];
		return table.groups.map((group) => ({
			group: {
				id: group.key,
				label: group.label,
				rowIds: group.rows.map((person) => person.id),
				collapsed: group.collapsed
			},
			rows: group.rows.map(toMatrixRow)
		}));
	});

	const legendItems: Array<{ status: TrainingStatus; label: string }> = [
		{ status: 'current', label: 'Current' },
		{ status: 'warning-yellow', label: 'Expiring Soon' },
		{ status: 'warning-orange', label: 'Expiring' },
		{ status: 'expired', label: 'Expired' },
		{ status: 'not-completed', label: 'Not Done' },
		{ status: 'not-required', label: 'N/A' },
		{ status: 'exempt', label: 'Exempt' }
	];
</script>

{#snippet matrixRow(row: MatrixRow)}
	<OperationalMatrix.Row {row} class="bg-card hover:bg-muted/20">
		<OperationalMatrix.RowHeader
			{row}
			sticky
			class="sticky left-0 z-10 w-48 min-w-32 max-w-48 border border-border bg-card px-2 py-1.5 text-left align-middle sm:min-w-48 sm:px-3"
		>
			{#if onPersonClick}
				<button
					type="button"
					class="flex w-full items-baseline gap-2 text-left text-foreground hover:text-primary sm:gap-4"
					onclick={() => onPersonClick?.(row.meta.person)}
				>
					<span class="w-8 shrink-0 font-mono text-xs font-semibold uppercase tracking-[0.08em] text-amber-700">
						{row.meta.rank}
					</span>
					<span class="truncate text-sm font-medium">{row.label}</span>
				</button>
			{:else}
				<span class="flex items-baseline gap-2 text-foreground sm:gap-4">
					<span class="w-8 shrink-0 font-mono text-xs font-semibold uppercase tracking-[0.08em] text-amber-700">
						{row.meta.rank}
					</span>
					<span class="truncate text-sm font-medium">{row.label}</span>
				</span>
			{/if}
		</OperationalMatrix.RowHeader>

		{#each matrixColumns as column (column.id)}
			{@const cell = getCellMetadata(row.meta.person, column.meta.type)}
			<OperationalMatrix.Cell
				{row}
				{column}
				ariaLabel={`${row.meta.person.lastName} ${column.label}: ${cell.statusInfo.label}`}
				onSelect={onCellClick ? () => onCellClick?.(row.meta.person, column.meta.type, cell.training) : undefined}
				class="min-w-28 bg-card sm:min-w-32"
			>
				<TrainingStatusCell
					status={cell.statusInfo.status}
					label={cell.displayText}
					srLabel={cell.statusInfo.label}
					class="h-10 rounded-none"
				/>
			</OperationalMatrix.Cell>
		{/each}
	</OperationalMatrix.Row>
{/snippet}

<OperationalMatrix.Root rows={matrixRows} columns={matrixColumns} class="grid h-full min-h-0 gap-2">
	{#if showSearch}
		<div class="max-w-sm">
			<Input
				type="search"
				aria-label="Search personnel"
				placeholder="Search personnel..."
				value={table.search}
				oninput={(e) => table.setSearch(e.currentTarget.value)}
			/>
		</div>
	{/if}

	<div class="flex flex-wrap items-center gap-2" aria-label="Status legend">
		{#each legendItems as item (item.status)}
			<TrainingStatusBadge status={item.status} label={item.label} />
		{/each}
	</div>

	<OperationalMatrix.Viewport
		ariaLabel="Training matrix viewport"
		class="h-full min-h-0 rounded-lg border border-border bg-card"
	>
		<OperationalMatrix.Table
			ariaLabel="Training status matrix"
			class="min-w-max table-fixed text-sm [&_[data-matrix-column-header]]:border [&_[data-matrix-column-header]]:border-border [&_[data-matrix-column-header]]:bg-muted/70 [&_[data-matrix-column-header]]:font-mono [&_[data-matrix-column-header]]:text-[10px] [&_[data-matrix-column-header]]:font-semibold [&_[data-matrix-column-header]]:uppercase [&_[data-matrix-cell]]:h-10 [&_[data-matrix-cell]]:border [&_[data-matrix-cell]]:border-border [&_[data-matrix-cell]]:p-0 [&_[data-slot=operational-matrix-cell-content]]:flex [&_[data-slot=operational-matrix-cell-content]]:h-10 [&_[data-slot=operational-matrix-cell-content]]:w-full [&_[data-slot=operational-matrix-cell-trigger]]:flex [&_[data-slot=operational-matrix-cell-trigger]]:h-10 [&_[data-slot=operational-matrix-cell-trigger]]:w-full [&_[data-slot=operational-matrix-cell-trigger]]:focus-visible:outline-hidden [&_[data-slot=operational-matrix-cell-trigger]]:focus-visible:ring-2 [&_[data-slot=operational-matrix-cell-trigger]]:focus-visible:ring-ring [&_[data-slot=operational-matrix-cell-trigger]]:focus-visible:ring-inset [&_[data-selected=true]]:ring-2 [&_[data-selected=true]]:ring-foreground [&_[data-selected=true]]:ring-inset"
		>
			<OperationalMatrix.Header>
				<OperationalMatrix.HeaderRow>
					<OperationalMatrix.CornerCell
						sticky
						class="sticky left-0 top-0 z-30 w-32 min-w-32 bg-muted px-2 py-1.5 sm:w-48 sm:min-w-48 sm:px-3"
					>
						<button
							class="font-mono text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground hover:text-foreground"
							type="button"
							onclick={() => table.toggleSort('name')}
						>
							Name{sortIndicator('name')}
						</button>
					</OperationalMatrix.CornerCell>
					{#each matrixColumns as column (column.id)}
						<OperationalMatrix.ColumnHeader
							{column}
							sticky
							class="sticky top-0 z-20 h-14 w-28 min-w-28 bg-muted px-1.5 text-center sm:w-32 sm:min-w-32"
						>
							<button
								class="grid w-full place-items-center gap-1 text-center"
								type="button"
								onclick={() => table.toggleSort(column.id)}
							>
								<span class="size-2 rounded-sm" style:background-color={column.meta.color} aria-hidden="true"></span>
								<span class="line-clamp-2 text-xs font-bold normal-case tracking-normal text-foreground">
									{column.label}{sortIndicator(column.id)}
								</span>
							</button>
						</OperationalMatrix.ColumnHeader>
					{/each}
				</OperationalMatrix.HeaderRow>
			</OperationalMatrix.Header>

			<OperationalMatrix.Body>
				{#if groupedMatrixRows.length > 0}
					{#each groupedMatrixRows as groupBlock (groupBlock.group.id)}
						<OperationalMatrix.RowGroup
							group={groupBlock.group}
							columnSpan={matrixColumns.length + 1}
							onclick={() => table.toggleGroup(groupBlock.group.id)}
							class="h-7 cursor-pointer bg-muted/40 text-[10px] font-semibold uppercase leading-none tracking-[0.18em] text-muted-foreground [&_th]:px-2 [&_th]:py-0.5 [&_th]:text-left"
						>
							{groupBlock.group.collapsed ? '▶' : '▼'}
							{groupBlock.group.label} ({groupBlock.group.rowIds.length})
						</OperationalMatrix.RowGroup>
						{#if !groupBlock.group.collapsed}
							{#each groupBlock.rows as row (row.id)}
								{@render matrixRow(row)}
							{/each}
						{/if}
					{/each}
				{:else}
					{#each matrixRows as row (row.id)}
						{@render matrixRow(row)}
					{/each}
				{/if}
			</OperationalMatrix.Body>
		</OperationalMatrix.Table>
	</OperationalMatrix.Viewport>
</OperationalMatrix.Root>
