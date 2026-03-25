<script lang="ts">
	import type { Personnel } from '$lib/types';
	import type { TrainingType, PersonnelTraining } from '$features/training/training.types';
	import { getTrainingStatus } from '$features/training/utils/trainingStatus';
	import { getCellDisplayText } from '$features/training/utils/cellDisplayText';
	import { TRAINING_STATUS_COLORS, type TrainingStatus } from '$features/training/training.types';
	import { useDataTable } from '$lib/components/ui/data-table/useDataTable.svelte';
	import type { ColumnDef, GroupDef } from '$lib/components/ui/data-table/useDataTable.svelte';
	import { SvelteMap } from 'svelte/reactivity';

	interface Props {
		personnel: Personnel[];
		trainingTypes: TrainingType[];
		trainings: PersonnelTraining[];
		onCellClick?: (person: Personnel, type: TrainingType, training: PersonnelTraining | undefined) => void;
		onPersonClick?: (person: Personnel) => void;
		showSearch?: boolean;
		groupBy?: GroupDef<Personnel>;
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
		},
		{
			key: 'rank',
			header: 'Rank',
			value: (p) => p.rank,
			compare: (a, b) => a.rank.localeCompare(b.rank)
		},
		{
			key: 'group',
			header: 'Group',
			value: (p) => p.groupName,
			compare: (a, b) => a.groupName.localeCompare(b.groupName)
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
				value: (p: Personnel) => {
					const t = getTraining(p.id, type.id);
					return getTrainingStatus(t, type, p).status;
				},
				compare: (a: Personnel, b: Personnel) => {
					const aInfo = getTrainingStatus(getTraining(a.id, type.id), type, a);
					const bInfo = getTrainingStatus(getTraining(b.id, type.id), type, b);
					return statusOrder[aInfo.status] - statusOrder[bInfo.status];
				}
			};
		}
	});

	function sortIndicator(key: string): string {
		if (table.sortKey !== key) return '';
		return table.sortDirection === 'asc' ? ' \u25B2' : ' \u25BC';
	}

	// Create a map for quick training lookup
	const trainingMap = $derived.by(() => {
		const map = new SvelteMap<string, PersonnelTraining>();
		for (const t of trainings) {
			map.set(`${t.personnelId}-${t.trainingTypeId}`, t);
		}
		return map;
	});

	function getTraining(personnelId: string, typeId: string) {
		return trainingMap.get(`${personnelId}-${typeId}`);
	}

	const totalCols = $derived(trainingTypes.length + 3);

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
				<button class="person-btn" onclick={() => onPersonClick(person)}>
					{person.lastName}, {person.firstName}
				</button>
			{:else}
				{person.lastName}, {person.firstName}
			{/if}
		</th>
		<td class="rank-cell">{person.rank}</td>
		<td class="group-cell">{person.groupName}</td>
		{#each trainingTypes as type (type.id)}
			{@const training = getTraining(person.id, type.id)}
			{@const statusInfo = getTrainingStatus(training, type, person)}
			{@const displayText = getCellDisplayText(statusInfo, training, type.expirationDateOnly)}
			{#if onCellClick}
				<td
					class="heatmap-cell"
					style="background-color: color-mix(in srgb, {statusInfo.color} 15%, transparent)"
					data-status={statusInfo.status}
					role="gridcell"
				>
					<button
						class="heatmap-btn"
						aria-label="{person.lastName} {type.name}: {statusInfo.label}"
						onclick={() => onCellClick(person, type, training)}
					>
						{displayText}
					</button>
				</td>
			{:else}
				<td
					class="heatmap-cell"
					style="background-color: color-mix(in srgb, {statusInfo.color} 15%, transparent)"
					data-status={statusInfo.status}
					aria-label="{person.lastName} {type.name}: {statusInfo.label}"
				>
					<span class="heatmap-text">{displayText}</span>
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

	<div class="matrix-legend" role="legend" aria-label="Status color legend">
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
					<th scope="col" class="name-header sortable" onclick={() => table.toggleSort('name')}>
						Name{sortIndicator('name')}
					</th>
					<th scope="col" class="rank-header sortable" onclick={() => table.toggleSort('rank')}>
						Rank{sortIndicator('rank')}
					</th>
					<th scope="col" class="group-header sortable" onclick={() => table.toggleSort('group')}>
						Group{sortIndicator('group')}
					</th>
					{#each trainingTypes as type (type.id)}
						<th scope="col" class="type-header sortable" onclick={() => table.toggleSort(type.id)}>
							<span class="type-dot" style="background-color: {type.color}"></span>
							{type.name}{sortIndicator(type.id)}
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
	}

	.matrix-legend {
		display: flex;
		flex-wrap: wrap;
		gap: var(--spacing-md);
		padding: var(--spacing-sm) var(--spacing-md);
		font-size: var(--font-size-xs);
		color: var(--color-text-muted);
	}

	.legend-item {
		display: flex;
		align-items: center;
		gap: var(--spacing-xs);
	}

	.legend-swatch {
		display: inline-block;
		width: 14px;
		height: 14px;
		border-radius: var(--radius-sm);
		border: 1px solid;
		flex-shrink: 0;
	}

	.matrix-search {
		padding: var(--spacing-sm) var(--spacing-md);
		border-bottom: 1px solid var(--color-divider);
		background: var(--color-surface);
	}

	.matrix-search input {
		width: 100%;
		max-width: 300px;
	}

	.matrix-container {
		flex: 1;
		min-height: 0;
		overflow: auto;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		background: var(--color-surface);
	}

	.matrix {
		width: 100%;
		border-collapse: collapse;
		font-size: var(--font-size-sm);
	}

	.matrix thead {
		position: sticky;
		top: 0;
		z-index: var(--z-sticky, 10);
		background: var(--color-surface);
	}

	.matrix th,
	.matrix td {
		padding: var(--spacing-sm);
		border-bottom: 1px solid var(--color-border);
		text-align: center;
		white-space: nowrap;
	}

	.name-header,
	.name-cell {
		position: sticky;
		left: 0;
		background: var(--color-surface);
		z-index: 5;
		text-align: left;
		min-width: 150px;
		max-width: 200px;
		border-right: 1px solid var(--color-border);
		color: var(--color-text);
	}

	.rank-header,
	.rank-cell {
		min-width: 50px;
		text-align: left;
	}

	.group-header,
	.group-cell {
		min-width: 80px;
		text-align: left;
		border-right: 2px solid var(--color-border);
	}

	.name-header {
		z-index: calc(var(--z-sticky, 10) + 5);
	}

	.sortable {
		cursor: pointer;
		user-select: none;
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-semibold, 600);
		color: var(--color-text-muted);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.sortable:hover {
		color: var(--color-text);
	}

	.type-header {
		min-width: 80px;
		vertical-align: bottom;
		white-space: nowrap;
	}

	.type-dot {
		display: inline-block;
		width: 8px;
		height: 8px;
		border-radius: 50%;
		margin-right: 4px;
		vertical-align: middle;
	}

	/* Group header rows — inline within the table */
	.group-header-row {
		cursor: pointer;
		background: var(--color-surface-variant);
	}

	.group-header-row:hover {
		background: var(--color-border);
	}

	.group-header-cell {
		position: sticky;
		left: 0;
		padding: var(--spacing-sm) var(--spacing-md) !important;
		text-align: left !important;
		font-weight: var(--font-weight-semibold, 600);
		font-size: var(--font-size-sm);
		color: var(--color-text-secondary);
		border-bottom: 1px solid var(--color-border);
		background: var(--color-surface-variant);
		z-index: 4;
	}

	.group-toggle-icon {
		font-size: 10px;
		width: 14px;
		display: inline-block;
	}

	.group-label {
		margin-left: var(--spacing-xs);
	}

	.group-count {
		font-weight: 400;
		color: var(--color-text-muted);
		margin-left: var(--spacing-xs);
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
		color: var(--color-text);
		font-size: inherit;
	}

	.person-btn:hover {
		color: var(--color-primary);
	}

	.heatmap-cell {
		vertical-align: middle;
		min-width: 80px;
		transition: filter 0.15s ease;
		border-left: 1px solid color-mix(in srgb, var(--color-border) 50%, transparent);
	}

	.heatmap-cell:hover {
		filter: brightness(0.92);
	}

	.heatmap-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		height: 100%;
		padding: var(--spacing-xs) var(--spacing-sm);
		background: transparent;
		border: none;
		cursor: pointer;
		color: var(--color-text);
		font-size: var(--font-size-xs);
		font-weight: 500;
		white-space: nowrap;
	}

	.heatmap-text {
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: var(--font-size-xs);
		font-weight: 500;
		color: var(--color-text);
		white-space: nowrap;
	}

	tr:hover .name-cell,
	tr:hover td {
		background-color: var(--color-surface-variant);
	}

	tr:hover .name-cell {
		background-color: var(--color-surface-variant);
	}

	/* Mobile Responsive Styles */
	@media (max-width: 640px) {
		.name-header,
		.name-cell {
			min-width: 100px;
			max-width: 100px;
			font-size: var(--font-size-xs);
			padding: var(--spacing-xs);
			white-space: nowrap;
			overflow: hidden;
			text-overflow: ellipsis;
		}

		.rank-header,
		.rank-cell,
		.group-header,
		.group-cell {
			display: none;
		}

		.type-header {
			min-width: 60px;
		}

		.heatmap-cell {
			min-width: 56px;
			min-height: 44px; /* Touch target */
		}

		.heatmap-btn,
		.heatmap-text {
			font-size: 9px;
			padding: var(--spacing-xs);
		}
	}

	/* Tablet Responsive Styles */
	@media (min-width: 641px) and (max-width: 1024px) {
		.name-header,
		.name-cell {
			min-width: 140px;
		}

		.type-header {
			min-width: 80px;
		}
	}

	/* Dark mode: increase tint opacity for better visibility */
	:global([data-theme='dark']) .heatmap-cell[data-status='not-required'],
	:global([data-theme='dark']) .heatmap-cell[data-status='exempt'] {
		background-color: color-mix(in srgb, var(--color-text-muted) 10%, transparent) !important;
	}

	:global([data-theme='dark']) .heatmap-cell[data-status='expired'] {
		background-color: color-mix(in srgb, #ef4444 20%, transparent) !important;
	}

	:global([data-theme='dark']) .heatmap-cell[data-status='warning-orange'] {
		background-color: color-mix(in srgb, #f97316 20%, transparent) !important;
	}
</style>
