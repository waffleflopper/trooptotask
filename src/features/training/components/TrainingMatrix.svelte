<script lang="ts">
	import type { Personnel } from '$lib/types';
	import type { TrainingType, PersonnelTraining } from '$features/training/training.types';
	import { getTrainingStatus } from '$features/training/utils/trainingStatus';
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

	const columns: ColumnDef<Personnel>[] = [
		{
			key: 'name',
			header: 'Personnel',
			value: (p) => `${p.rank} ${p.lastName}, ${p.firstName}`,
			compare: (a, b) => a.lastName.localeCompare(b.lastName)
		}
	];

	const table = useDataTable({
		data: () => personnel,
		columns,
		initialSortKey: 'name',
		groupBy
	});

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

	const totalCols = $derived(trainingTypes.length + 1);
</script>

{#snippet personRow(person: Personnel)}
	<tr>
		<th scope="row" class="name-cell">
			{#if onPersonClick}
				<button class="person-btn" onclick={() => onPersonClick(person)}>
					<span class="person-rank">{person.rank}</span>
					{person.lastName}, {person.firstName}
				</button>
			{:else}
				<span class="person-rank">{person.rank}</span>
				{person.lastName}, {person.firstName}
			{/if}
		</th>
		{#each trainingTypes as type (type.id)}
			{@const training = getTraining(person.id, type.id)}
			{@const statusInfo = getTrainingStatus(training, type, person)}
			<td class="status-cell">
				<div class="status-content">
					{#if onCellClick}
						<button
							class="status-badge"
							style="background-color: {statusInfo.color}"
							data-status={statusInfo.status}
							aria-label="{person.lastName} {type.name}: {statusInfo.label}"
							onclick={() => onCellClick(person, type, training)}
						>
							{statusInfo.label}
						</button>
					{:else}
						<span
							class="status-badge"
							style="background-color: {statusInfo.color}"
							data-status={statusInfo.status}
							aria-label="{person.lastName} {type.name}: {statusInfo.label}"
						>
							{statusInfo.label}
						</span>
					{/if}
					<span class="completion-date">{training?.completionDate ?? ''}</span>
				</div>
			</td>
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

	<div class="matrix-container">
		<table class="matrix" aria-label="Training status matrix">
			<thead>
				<tr>
					<th scope="col" class="name-header" onclick={() => table.toggleSort('name')}>
						Personnel
						{#if table.sortDirection === 'asc'}↑{:else}↓{/if}
					</th>
					{#each trainingTypes as type (type.id)}
						<th scope="col" class="type-header">
							<span class="type-name" style="background-color: {type.color}">
								{type.name}
							</span>
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
		overflow: auto;
		max-height: 100%;
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
		min-width: 180px;
		border-right: 2px solid var(--color-border);
		color: var(--color-text);
	}

	.name-header {
		z-index: calc(var(--z-sticky, 10) + 5);
		cursor: pointer;
		user-select: none;
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-semibold, 600);
		color: var(--color-text-muted);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.name-header:hover {
		color: var(--color-text);
	}

	.type-header {
		min-width: 100px;
		vertical-align: bottom;
	}

	.type-name {
		display: inline-block;
		padding: var(--spacing-xs) var(--spacing-sm);
		border-radius: var(--radius-sm);
		color: white;
		font-weight: 500;
		font-size: var(--font-size-sm);
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
		padding: var(--spacing-sm) var(--spacing-md) !important;
		text-align: left !important;
		font-weight: var(--font-weight-semibold, 600);
		font-size: var(--font-size-sm);
		color: var(--color-text-secondary);
		border-bottom: 1px solid var(--color-border);
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

	.person-btn:hover .person-rank {
		color: var(--color-primary);
	}

	.person-rank {
		display: inline-block;
		font-weight: 600;
		color: var(--color-text-muted);
		min-width: 35px;
		margin-right: var(--spacing-xs);
	}

	.status-cell {
		vertical-align: middle;
	}

	/* Fixed-height content wrapper ensures all cells align regardless of date */
	.status-content {
		display: flex;
		flex-direction: column;
		align-items: center;
		min-height: 38px;
		justify-content: center;
	}

	.status-badge {
		display: inline-block;
		padding: var(--spacing-xs) var(--spacing-sm);
		border-radius: var(--radius-sm);
		color: white;
		font-weight: 500;
		font-size: var(--font-size-sm);
		cursor: pointer;
		border: none;
		transition: opacity 0.15s ease;
	}

	.status-badge:hover {
		opacity: 0.8;
	}

	/* Always reserve space for the date line so rows stay consistent height */
	.completion-date {
		display: block;
		font-size: 10px;
		color: var(--color-text-muted);
		min-height: 14px;
		line-height: 14px;
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
			width: 100px;
			font-size: var(--font-size-xs);
			padding: var(--spacing-xs);
			white-space: nowrap;
			overflow: hidden;
			text-overflow: ellipsis;
		}

		.type-header {
			min-width: 60px;
		}

		.type-name {
			font-size: 9px;
			padding: 2px 4px;
			white-space: nowrap;
		}

		.person-rank {
			min-width: 24px;
			font-size: var(--font-size-xs);
			margin-right: 2px;
		}

		.status-cell {
			min-width: 60px;
			min-height: 44px; /* Touch target */
		}

		.status-badge {
			font-size: var(--font-size-xs);
			padding: var(--spacing-xs);
		}

		.completion-date {
			font-size: 9px;
			min-height: 12px;
			line-height: 12px;
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

	/* Dark mode overrides for light-colored status badges */
	:global([data-theme='dark']) .status-badge[data-status='not-required'] {
		color: var(--color-text);
	}

	:global([data-theme='dark']) .status-badge[data-status='exempt'] {
		color: var(--color-text);
	}
</style>
