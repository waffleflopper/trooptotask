<script lang="ts">
	import type { Personnel } from '$lib/types';
	import type { TrainingType, PersonnelTraining } from '$features/training/training.types';
	import { getTrainingStatus, type TrainingStatusInfo } from '$features/training/utils/trainingStatus';
	import { getCellDisplayText } from '$features/training/utils/cellDisplayText';
	import { TRAINING_STATUS_COLORS, type TrainingStatus } from '$features/training/training.types';
	import { useDataTable } from '$lib/components/ui/data-table/useDataTable.svelte';
	import type { ColumnDef, GroupDef } from '$lib/components/ui/data-table/useDataTable.svelte';

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

	let {
		personnel,
		trainingTypes,
		trainings,
		onCellClick,
		onPersonClick,
		showSearch = false,
		groupBy
	}: Props = $props();

	const statusOrder: Record<TrainingStatus, number> = {
		expired: 0,
		'warning-orange': 1,
		'warning-yellow': 2,
		'not-completed': 3,
		current: 4,
		'not-required': 5,
		exempt: 6
	};

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
		groupBy,
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
					return statusOrder[aStatus] - statusOrder[bStatus];
				}
			};
		}
	});

	function sortIndicator(key: string): string {
		if (table.sortKey !== key) return '';
		return table.sortDirection === 'asc' ? ' \u25B2' : ' \u25BC';
	}

	function createTrainingKey(personnelId: string, typeId: string): string {
		return `${personnelId}-${typeId}`;
	}

	const trainingLookup = $derived.by(() => {
		const map = new Map<string, PersonnelTraining>();
		for (const t of trainings) {
			map.set(createTrainingKey(t.personnelId, t.trainingTypeId), t);
		}
		return map;
	});

	const cellMetadataLookup = $derived.by(() => {
		const map = new Map<string, TrainingCellMetadata>();
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

	const totalCols = $derived(trainingTypes.length + 1);

	const legendItems: Array<{ status: TrainingStatus; label: string; color: string }> = [
		{ status: 'current', label: 'Current', color: TRAINING_STATUS_COLORS['current'] },
		{ status: 'warning-yellow', label: 'Expiring Soon', color: TRAINING_STATUS_COLORS['warning-yellow'] },
		{ status: 'warning-orange', label: 'Expiring', color: TRAINING_STATUS_COLORS['warning-orange'] },
		{ status: 'expired', label: 'Expired', color: TRAINING_STATUS_COLORS['expired'] },
		{ status: 'not-completed', label: 'Not Done', color: TRAINING_STATUS_COLORS['not-completed'] },
		{ status: 'not-required', label: 'N/A', color: TRAINING_STATUS_COLORS['not-required'] },
		{ status: 'exempt', label: 'Exempt', color: TRAINING_STATUS_COLORS['exempt'] }
	];
</script>

{#snippet personRow(person: Personnel)}
	<tr>
		<th scope="row" class="name-cell">
			{#if onPersonClick}
				<button class="person-btn" type="button" onclick={() => onPersonClick(person)}>
					<span class="person-rank">{person.rank}</span>
					{person.lastName}, {person.firstName}
				</button>
			{:else}
				<span class="person-rank">{person.rank}</span>
				{person.lastName}, {person.firstName}
			{/if}
		</th>
		{#each trainingTypes as type (type.id)}
			{@const cell = getCellMetadata(person, type)}
			{#if onCellClick}
				<td
					class="heatmap-cell"
					style="background-color: color-mix(in srgb, {cell.statusInfo.color} 15%, transparent)"
					data-status={cell.statusInfo.status}
					role="gridcell"
				>
					<button
						class="heatmap-btn"
						type="button"
						aria-label="{person.lastName} {type.name}: {cell.statusInfo.label}"
						onclick={() => onCellClick(person, type, cell.training)}
					>
						<span class="cell-status-dot" style="background-color: {cell.statusInfo.color}"></span>
						{cell.displayText}
					</button>
				</td>
			{:else}
				<td
					class="heatmap-cell"
					style="background-color: color-mix(in srgb, {cell.statusInfo.color} 15%, transparent)"
					data-status={cell.statusInfo.status}
					aria-label="{person.lastName} {type.name}: {cell.statusInfo.label}"
				>
					<span class="cell-status-dot" style="background-color: {cell.statusInfo.color}"></span>
					<span class="heatmap-text">{cell.displayText}</span>
				</td>
			{/if}
		{/each}
	</tr>
{/snippet}

<div class="matrix-wrapper">
	{#if showSearch}
		<div class="matrix-search">
			<input
				type="search"
				class="input"
				placeholder="Search personnel..."
				value={table.search}
				oninput={(e) => table.setSearch(e.currentTarget.value)}
			/>
		</div>
	{/if}

	<div class="matrix-legend" aria-label="Status color legend">
		{#each legendItems as item (item.status)}
			<span class="legend-item">
				<span
					class="legend-swatch"
					style="background-color: color-mix(in srgb, {item.color} 15%, transparent); border-color: {item.color}"
				></span>
				{item.label}
			</span>
		{/each}
	</div>

	<div class="matrix-container">
		<table class="matrix" aria-label="Training status matrix">
			<thead>
				<tr>
					<th scope="col" class="name-header sortable">
						<button class="header-btn" type="button" onclick={() => table.toggleSort('name')}>
							Name{sortIndicator('name')}
						</button>
					</th>
					{#each trainingTypes as type (type.id)}
						<th scope="col" class="type-header sortable">
							<button class="header-btn" type="button" onclick={() => table.toggleSort(type.id)}>
								<span class="type-dot" style="background-color: {type.color}"></span>
								{type.name}{sortIndicator(type.id)}
							</button>
						</th>
					{/each}
				</tr>
			</thead>
			<tbody>
				{#if table.groups.length > 0}
					{#each table.groups as group (group.key)}
						<tr class="group-header-row" onclick={() => table.toggleGroup(group.key)}>
							<td colspan={totalCols} class="group-header-cell">
								<span class="group-toggle-icon">{group.collapsed ? '▶' : '▼'}</span>
								<span class="group-label">{group.label}</span>
								<span class="group-count">({group.rows.length})</span>
							</td>
						</tr>
						{#if !group.collapsed}
							{#each group.rows as person (person.id)}
								{@render personRow(person)}
							{/each}
						{/if}
					{/each}
				{:else}
					{#each table.rows as person (person.id)}
						{@render personRow(person)}
					{/each}
				{/if}
			</tbody>
		</table>
	</div>
</div>

<style>
	.matrix-wrapper {
		display: flex;
		flex-direction: column;
		height: 100%;
		min-height: 0;
		border: var(--border-thin);
		border-radius: var(--radius-lg);
		background: var(--surface-panel);
	}

	.matrix-legend {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-2);
		padding: var(--sp-2) var(--sp-3);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-tertiary);
		border-bottom: var(--border-thin);
		background: color-mix(in srgb, var(--surface-subtle) 72%, var(--surface-panel) 28%);
	}

	.legend-item {
		display: flex;
		align-items: center;
		gap: var(--sp-1);
	}

	.legend-swatch {
		display: inline-block;
		width: 11px;
		height: 11px;
		border-radius: 2px;
		border: 1px solid;
		flex-shrink: 0;
	}

	.matrix-search {
		padding: var(--sp-2) var(--sp-3);
		border-bottom: var(--border-thin);
		background: color-mix(in srgb, var(--surface-panel) 88%, var(--surface-subtle) 12%);
	}

	.matrix-search input {
		width: 100%;
		max-width: 300px;
	}

	.matrix-container {
		flex: 1;
		min-height: 0;
		overflow: auto;
	}

	.matrix {
		width: 100%;
		border-collapse: collapse;
		font-size: var(--text-sm);
	}

	.matrix thead {
		position: sticky;
		top: 0;
		z-index: var(--z-sticky, 10);
		background: var(--surface-subtle);
	}

	.matrix th,
	.matrix td {
		padding: 4px 8px;
		border-bottom: var(--border-rule);
		text-align: left;
		white-space: nowrap;
	}

	.name-header,
	.name-cell {
		position: sticky;
		left: 0;
		background: var(--surface-panel);
		z-index: 5;
		text-align: left;
		width: 220px;
		min-width: 220px;
		max-width: 240px;
		border-right: var(--border-thin);
		color: var(--text-primary);
	}

	.name-header {
		z-index: calc(var(--z-sticky, 10) + 5);
		background: var(--surface-subtle);
	}

	.sortable {
		padding: 0;
	}

	.header-btn {
		appearance: none;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: var(--sp-2);
		width: 100%;
		padding: 0;
		border: none;
		background: transparent;
		color: var(--text-tertiary);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.1em;
		text-transform: uppercase;
		cursor: pointer;
	}

	.name-header .header-btn {
		justify-content: flex-start;
	}

	.header-btn:hover {
		color: var(--text-primary);
	}

	.type-header {
		min-width: 164px;
		vertical-align: bottom;
		background: var(--surface-subtle);
	}

	.type-dot {
		display: inline-block;
		width: 10px;
		height: 10px;
		border-radius: 2px;
		flex-shrink: 0;
	}

	.group-header-row {
		cursor: pointer;
		background: color-mix(in srgb, var(--surface-subtle) 74%, var(--surface-panel) 26%);
	}

	.group-header-row:hover {
		background: color-mix(in srgb, var(--surface-subtle) 88%, var(--surface-panel) 12%);
	}

	.group-header-cell {
		position: sticky;
		left: 0;
		padding: 8px 10px !important;
		text-align: left !important;
		font-family: var(--font-mono);
		font-weight: var(--font-weight-semibold);
		font-size: var(--text-xs);
		color: var(--text-secondary);
		letter-spacing: 0.12em;
		text-transform: uppercase;
		border-bottom: var(--border-thin);
		background: color-mix(in srgb, var(--surface-subtle) 74%, var(--surface-panel) 26%);
		z-index: 4;
	}

	.group-toggle-icon {
		font-size: 10px;
		width: 14px;
		display: inline-block;
	}

	.group-label {
		margin-left: var(--sp-2);
		color: var(--text-primary);
	}

	.group-count {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 20px;
		min-height: 20px;
		padding: 2px 5px;
		border: var(--border-thin);
		border-radius: var(--radius-sm);
		background: var(--surface-panel);
		color: var(--text-secondary);
		font-size: var(--text-xs);
		margin-left: var(--sp-2);
	}

	.person-btn {
		display: flex;
		align-items: center;
		width: 100%;
		padding: 0;
		background: transparent;
		border: none;
		text-align: left;
		cursor: pointer;
		color: var(--text-primary);
		font-size: inherit;
	}

	.person-btn:hover {
		color: var(--amber-dark);
	}

	.person-btn:hover .person-rank {
		color: var(--amber-dark);
	}

	.person-rank {
		display: inline-block;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--amber-dark);
		min-width: 34px;
		margin-right: var(--sp-2);
	}

	.heatmap-cell {
		vertical-align: middle;
		min-width: 164px;
		transition: background-color var(--transition-fast);
		border-left: var(--border-rule);
	}

	.heatmap-cell:hover {
		background-color: color-mix(in srgb, var(--surface-subtle) 72%, var(--surface-panel) 28%) !important;
	}

	.heatmap-btn {
		display: flex;
		align-items: center;
		justify-content: flex-start;
		width: 100%;
		height: 100%;
		padding: 4px 2px;
		background: transparent;
		border: none;
		cursor: pointer;
		color: var(--text-primary);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-medium);
		white-space: nowrap;
		gap: var(--sp-2);
	}

	.heatmap-text {
		display: inline-flex;
		align-items: center;
		padding: 4px 2px;
		font-size: var(--text-xs);
		font-weight: var(--font-weight-medium);
		color: var(--text-primary);
		white-space: nowrap;
		gap: var(--sp-2);
	}

	.cell-status-dot {
		display: inline-block;
		width: 0.75rem;
		height: 0.75rem;
		border-radius: 999px;
		flex-shrink: 0;
	}

	tr:hover .name-cell,
	tr:hover td {
		background-color: color-mix(in srgb, var(--surface-subtle) 72%, var(--surface-panel) 28%);
	}

	tr:hover .name-cell {
		background-color: color-mix(in srgb, var(--surface-subtle) 72%, var(--surface-panel) 28%);
	}

	@media (max-width: 640px) {
		.name-header,
		.name-cell {
			min-width: 124px;
			max-width: 124px;
			padding: var(--sp-2);
			white-space: nowrap;
			overflow: hidden;
			text-overflow: ellipsis;
		}

		.type-header {
			min-width: 120px;
		}

		.heatmap-cell {
			min-width: 120px;
			min-height: 32px;
		}

		.heatmap-btn,
		.heatmap-text {
			font-size: 9px;
			padding: 3px 2px;
		}
	}

	@media (min-width: 641px) and (max-width: 1024px) {
		.name-header,
		.name-cell {
			min-width: 160px;
		}

		.type-header {
			min-width: 144px;
		}
	}

	:global([data-theme='dark']) .heatmap-cell[data-status='not-required'],
	:global([data-theme='dark']) .heatmap-cell[data-status='exempt'] {
		background-color: color-mix(in srgb, var(--text-tertiary) 10%, transparent) !important;
	}

	:global([data-theme='dark']) .heatmap-cell[data-status='expired'] {
		background-color: color-mix(in srgb, #ef4444 20%, transparent) !important;
	}

	:global([data-theme='dark']) .heatmap-cell[data-status='warning-orange'] {
		background-color: color-mix(in srgb, #f97316 20%, transparent) !important;
	}
</style>
