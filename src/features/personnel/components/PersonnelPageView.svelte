<script lang="ts">
	import { RATING_STATUS_COLORS, WORKFLOW_STATUS_OPTIONS } from '$features/rating-scheme/rating-scheme.types';
	import { personnelStore } from '$features/personnel/stores/personnel.svelte';
	import { pinnedGroupsStore } from '$lib/stores/pinnedGroups.svelte';
	import { ratingSchemeStore } from '$features/rating-scheme/stores/ratingScheme.svelte';
	import { subscriptionStore } from '$lib/stores/subscription.svelte';
	import RatingSchemeTableView from '$features/rating-scheme/components/RatingSchemeTableView.svelte';
	import RatingSchemeGroupedView from '$features/rating-scheme/components/RatingSchemeGroupedView.svelte';
	import PageToolbar from '$lib/components/PageToolbar.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import type { OverflowItem } from '$lib/components/ui/OverflowMenu.svelte';
	import { getRatingDueStatus } from '$features/rating-scheme/utils/ratingScheme';
	import { exportRatingScheme } from '$features/rating-scheme/utils/ratingSchemeExport';
	import type { PersonnelPageContext } from '$features/personnel/contexts/PersonnelPageContext.svelte';
	import DataTable from '$lib/components/ui/data-table/DataTable.svelte';
	import { useDataTable } from '$lib/components/ui/data-table/useDataTable.svelte';
	import type { ColumnDef } from '$lib/components/ui/data-table/useDataTable.svelte';
	import type { Personnel } from '$lib/types';

	interface Props {
		ctx: PersonnelPageContext;
		allPersonnel: import('$lib/types').Personnel[];
		permissions: import('$lib/types').OrganizationMemberPermissions | null | undefined;
	}

	let { ctx, allPersonnel, permissions }: Props = $props();

	const readOnly = $derived(subscriptionStore.billingEnabled && subscriptionStore.isReadOnly);

	const ratingStats = $derived.by(() => {
		const counts = { overdue: 0, 'due-30': 0, 'due-60': 0, current: 0, completed: 0 };
		for (const entry of ratingSchemeStore.items) {
			const status = getRatingDueStatus(entry.ratingPeriodEnd, entry.status);
			counts[status]++;
		}
		return counts;
	});

	const personnelOverflowItems = $derived.by<OverflowItem[]>(() => {
		const items: OverflowItem[] = [];
		if (ctx.canAddPersonnel) {
			items.push({ label: 'Add Person', onclick: () => ctx.handleAdd(), disabled: readOnly });
			items.push({ label: 'Manage Groups', onclick: () => ctx.openGroupManager(), disabled: readOnly });
			items.push({
				label: 'Bulk Import',
				onclick: () => ctx.openBulkManager(),
				divider: true,
				disabled: readOnly
			});
		}
		return items;
	});

	// Personnel DataTable setup
	const personnelColumns: ColumnDef<Personnel>[] = [
		{ key: 'rank', header: 'Rank', value: (p) => p.rank },
		{
			key: 'name',
			header: 'Name',
			value: (p) => `${p.lastName}, ${p.firstName}`,
			compare: (a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName)
		},
		{ key: 'mos', header: 'MOS', value: (p) => p.mos },
		{ key: 'role', header: 'Role', value: (p) => p.clinicRole },
		{ key: 'group', header: 'Group', value: (p) => p.groupName }
	];

	if (permissions?.canEditPersonnel) {
		personnelColumns.push({ key: 'actions', header: '', value: () => '', searchable: false });
	}

	const azTable = useDataTable<Personnel>({
		data: () => personnelStore.items,
		columns: personnelColumns,
		initialSortKey: 'name',
		initialSortDirection: 'asc'
	});

	const groupedTable = useDataTable<Personnel>({
		data: () => personnelStore.items,
		columns: personnelColumns,
		initialSortKey: 'name',
		initialSortDirection: 'asc',
		groupBy: {
			key: (p) => p.groupName || 'Unassigned',
			compare: (a, b) => {
				const aPin = pinnedGroupsStore.list.includes(a) ? 0 : 1;
				const bPin = pinnedGroupsStore.list.includes(b) ? 0 : 1;
				if (aPin !== bPin) return aPin - bPin;
				return a.localeCompare(b);
			}
		}
	});

	let rosterSearch = $state('');

	$effect(() => {
		azTable.setSearch(rosterSearch);
		groupedTable.setSearch(rosterSearch);
	});

	const handleRowClick = permissions?.canEditPersonnel ? (person: Personnel) => ctx.handleEdit(person) : undefined;
</script>

<svelte:head>
	<title>Personnel - Troop to Task</title>
</svelte:head>

<div class="page">
	<PageToolbar
		title="Personnel"
		helpTopic={ctx.pageView === 'rating-scheme' ? 'rating-scheme' : 'personnel'}
		overflowItems={personnelOverflowItems}
	>
		{#if ctx.canAddPersonnel}
			<button class="btn-ghost" onclick={() => ctx.openGroupManager()} disabled={readOnly}> Manage Groups </button>
			<button
				class="btn btn-sm btn-primary"
				data-testid="add-personnel-btn"
				onclick={() => ctx.handleAdd()}
				disabled={readOnly}
			>
				Add Person
			</button>
			{#if readOnly}
				<span class="text-muted" style="font-size: var(--font-size-xs);">Upgrade to edit</span>
			{/if}
		{/if}
	</PageToolbar>

	{#if !permissions?.canViewPersonnel}
		<div class="no-permission">
			<h2>Access Restricted</h2>
			<p>You don't have permission to view this area. Contact your organization admin for access.</p>
		</div>
	{:else}
		<div class="page-view-toggle">
			<button class="page-view-btn" class:active={ctx.pageView === 'roster'} onclick={() => (ctx.pageView = 'roster')}>
				Roster
			</button>
			<button
				class="page-view-btn"
				class:active={ctx.pageView === 'rating-scheme'}
				onclick={() => (ctx.pageView = 'rating-scheme')}
			>
				Rating Scheme
			</button>
		</div>

		{#if ctx.pageView === 'roster'}
			<main class="page-content">
				{#if ctx.totalPersonnel === 0}
					<EmptyState
						message="No personnel added yet."
						actionLabel={permissions?.canEditPersonnel ? 'Add Person' : undefined}
						onAction={permissions?.canEditPersonnel ? () => ctx.handleAdd() : undefined}
					/>
				{:else}
					{#key ctx.viewMode}
						<DataTable
							table={ctx.viewMode === 'alphabetical' ? azTable : groupedTable}
							columns={personnelColumns}
							onRowClick={handleRowClick}
							ariaLabel="Personnel roster"
							emptyMessage="No personnel match your search."
						>
							{#snippet toolbar(tbl)}
								<div class="roster-toolbar">
									<span class="roster-count">({personnelStore.items.length})</span>
									<input
										type="search"
										class="input roster-search"
										data-testid="personnel-search"
										placeholder="Search by name, rank, or role..."
										bind:value={rosterSearch}
									/>
									<div class="view-toggle">
										<span class="view-label">View:</span>
										<button
											class="view-btn"
											class:active={ctx.viewMode === 'alphabetical'}
											onclick={() => (ctx.viewMode = 'alphabetical')}
										>
											A-Z
										</button>
										<button
											class="view-btn"
											class:active={ctx.viewMode === 'by-group'}
											onclick={() => (ctx.viewMode = 'by-group')}
										>
											By Group
										</button>
									</div>
									{#if tbl.search && tbl.totalRows !== personnelStore.items.length}
										<span class="roster-filter-info">Showing {tbl.totalRows} of {personnelStore.items.length}</span>
									{/if}
								</div>
							{/snippet}
							{#snippet cell(row, col)}
								{#if col.key === 'rank'}
									<span class="cell-rank">{row.rank}</span>
								{:else if col.key === 'name'}
									<span class="cell-name">{row.lastName}, {row.firstName}</span>
								{:else if col.key === 'actions'}
									<button
										class="btn btn-sm btn-secondary"
										onclick={(e) => {
											e.stopPropagation();
											ctx.handleEdit(row);
										}}
									>
										Edit
									</button>
								{:else}
									{String(col.value(row) ?? '')}
								{/if}
							{/snippet}
							{#snippet groupHeader(group)}
								<div class="dt-group-header">
									<button class="dt-group-toggle" onclick={group.toggle}>
										<span class="dt-toggle-icon">{group.collapsed ? '▶' : '▼'}</span>
										<span>{group.label}</span>
										<span class="dt-group-count">({group.count})</span>
									</button>
									<button
										class="dt-pin-btn"
										class:pinned={pinnedGroupsStore.list.includes(group.key)}
										onclick={() => pinnedGroupsStore.toggle(group.key)}
										title={pinnedGroupsStore.list.includes(group.key) ? 'Unpin group' : 'Pin group to top'}
									>
										{pinnedGroupsStore.list.includes(group.key) ? '📌' : '📍'}
									</button>
								</div>
							{/snippet}
						</DataTable>
					{/key}
				{/if}
			</main>
		{:else}
			<div class="rating-stats-bar">
				<div class="rating-stat" style="--stat-color: {RATING_STATUS_COLORS.overdue}">
					<span class="stat-count">{ratingStats.overdue}</span>
					<span class="stat-label">Overdue</span>
				</div>
				<div class="rating-stat" style="--stat-color: {RATING_STATUS_COLORS['due-30']}">
					<span class="stat-count">{ratingStats['due-30']}</span>
					<span class="stat-label">Due 30d</span>
				</div>
				<div class="rating-stat" style="--stat-color: {RATING_STATUS_COLORS['due-60']}">
					<span class="stat-count">{ratingStats['due-60']}</span>
					<span class="stat-label">Due 60d</span>
				</div>
				<div class="rating-stat" style="--stat-color: {RATING_STATUS_COLORS.current}">
					<span class="stat-count">{ratingStats.current}</span>
					<span class="stat-label">Current</span>
				</div>
				<div class="rating-stat" style="--stat-color: {RATING_STATUS_COLORS.completed}">
					<span class="stat-count">{ratingStats.completed}</span>
					<span class="stat-label">Completed</span>
				</div>
			</div>

			<div class="rating-toolbar">
				{#if permissions?.canEditPersonnel}
					<button class="btn btn-sm btn-primary" onclick={() => ctx.handleAddRatingEntry()} disabled={readOnly}>
						Add Entry
					</button>
					{#if readOnly}
						<span class="text-muted" style="font-size: var(--font-size-xs);">Upgrade to edit</span>
					{/if}
				{/if}
				<button
					class="btn btn-sm btn-secondary"
					onclick={() => exportRatingScheme(ctx.filteredRatingEntries, personnelStore.items)}
				>
					Export
				</button>
				<div class="spacer"></div>
				<select class="select rating-filter" bind:value={ctx.evalTypeFilter}>
					<option value="all">All Types</option>
					<option value="OER">OER</option>
					<option value="NCOER">NCOER</option>
					<option value="WOER">WOER</option>
				</select>
				<select class="select rating-filter" bind:value={ctx.ratingFilter}>
					<option value="active">Active</option>
					<option value="completed">Completed</option>
					<option value="change-of-rater">Change of Rater</option>
					<option value="all">All Statuses</option>
				</select>
				{#if ctx.hasAnyWorkflowStatus}
					<select class="select rating-filter" bind:value={ctx.workflowFilter}>
						<option value="all">All Workflow</option>
						{#each WORKFLOW_STATUS_OPTIONS as opt (opt.value)}
							<option value={opt.value}>{opt.label}</option>
						{/each}
					</select>
				{/if}
				<div class="view-toggle">
					<button
						class="view-btn"
						class:active={ctx.ratingViewMode === 'grouped'}
						onclick={() => (ctx.ratingViewMode = 'grouped')}
					>
						Grouped
					</button>
					<button
						class="view-btn"
						class:active={ctx.ratingViewMode === 'table'}
						onclick={() => (ctx.ratingViewMode = 'table')}
					>
						Table
					</button>
				</div>
			</div>

			<main class="page-content">
				{#if ctx.ratingViewMode === 'grouped'}
					<RatingSchemeGroupedView
						entries={ctx.filteredRatingEntries}
						personnel={allPersonnel}
						onEdit={(entry) => ctx.handleEditRatingEntry(entry)}
					/>
				{:else}
					<RatingSchemeTableView
						entries={ctx.filteredRatingEntries}
						personnel={allPersonnel}
						onEdit={(entry) => ctx.handleEditRatingEntry(entry)}
					/>
				{/if}
			</main>
		{/if}
	{/if}
</div>

<style>
	.page {
		height: 100%;
		display: flex;
		flex-direction: column;
		background: var(--color-bg);
	}

	.page-view-toggle {
		display: flex;
		justify-content: center;
		gap: 0;
		padding: var(--spacing-sm) var(--spacing-lg);
		border-bottom: 1px solid var(--color-border);
		background: var(--color-surface);
	}

	.btn-ghost {
		background: none;
		border: none;
		color: var(--color-text-muted);
		font-size: var(--font-size-sm);
		font-weight: 500;
		padding: var(--spacing-xs) var(--spacing-sm);
		border-radius: var(--radius-sm);
		cursor: pointer;
		transition: all 0.15s;
	}

	.btn-ghost:hover {
		color: var(--color-text);
		background: var(--color-surface-variant);
	}

	.page-view-btn {
		padding: var(--spacing-xs) var(--spacing-lg);
		font-size: var(--font-size-sm);
		font-weight: 500;
		border: 1px solid var(--color-border);
		background: transparent;
		color: var(--color-text-secondary);
		cursor: pointer;
		transition: all 0.15s;
	}

	.page-view-btn:first-child {
		border-radius: var(--radius-sm) 0 0 var(--radius-sm);
	}

	.page-view-btn:last-child {
		border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
		border-left: none;
	}

	.page-view-btn.active {
		background: var(--color-primary);
		border-color: var(--color-primary);
		color: white;
	}

	.rating-stats-bar {
		display: flex;
		gap: var(--spacing-md);
		padding: var(--spacing-md) var(--spacing-lg);
		border-bottom: 1px solid var(--color-border);
		background: var(--color-surface);
	}

	.rating-stat {
		display: flex;
		align-items: center;
		gap: var(--spacing-xs);
		font-size: var(--font-size-sm);
	}

	.stat-count {
		font-weight: 600;
		color: var(--stat-color);
	}

	.stat-label {
		color: var(--color-text-muted);
	}

	.rating-toolbar {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		padding: var(--spacing-sm) var(--spacing-lg);
		border-bottom: 1px solid var(--color-border);
		background: var(--color-surface);
	}

	.rating-filter {
		width: auto;
		font-size: var(--font-size-sm);
	}

	/* Personnel Roster Toolbar */
	.roster-toolbar {
		display: flex;
		align-items: center;
		gap: var(--spacing-md);
		padding: var(--spacing-md) var(--spacing-lg);
		border-bottom: 1px solid var(--color-divider);
	}

	.roster-count {
		font-family: var(--font-mono);
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
	}

	.roster-search {
		flex: 1;
		max-width: 400px;
	}

	.roster-filter-info {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
	}

	.view-toggle {
		display: flex;
		align-items: center;
		gap: var(--spacing-xs);
	}

	.view-label {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
	}

	.view-btn {
		padding: var(--spacing-xs) var(--spacing-sm);
		font-size: var(--font-size-sm);
		border: 1px solid var(--color-border);
		background: var(--color-surface);
		color: var(--color-text);
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.view-btn:first-of-type {
		border-radius: var(--radius-md) 0 0 var(--radius-md);
	}

	.view-btn:last-of-type {
		border-radius: 0 var(--radius-md) var(--radius-md) 0;
		border-left: none;
	}

	.view-btn:hover {
		background: var(--color-bg);
	}

	.view-btn.active {
		background: var(--color-primary);
		border-color: var(--color-primary);
		color: white;
	}

	.no-permission {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		min-height: 300px;
		text-align: center;
		color: var(--color-text-muted);
	}
	.no-permission h2 {
		font-size: var(--font-size-lg);
		margin-bottom: var(--spacing-sm);
		color: var(--color-text);
	}

	/* .page-content base + mobile in app.css */

	/* DataTable cell styles */
	.cell-rank {
		font-weight: 600;
		color: var(--color-primary);
	}

	.cell-name {
		font-weight: 500;
	}

	/* DataTable group header styles */
	.dt-group-header {
		display: flex;
		align-items: center;
		width: 100%;
	}

	.dt-group-toggle {
		flex: 1;
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		padding: var(--spacing-xs) 0;
		background: transparent;
		border: none;
		color: inherit;
		font: inherit;
		font-weight: var(--font-weight-semibold);
		cursor: pointer;
		text-align: left;
	}

	.dt-toggle-icon {
		font-size: 10px;
		width: 12px;
	}

	.dt-group-count {
		font-weight: 400;
		opacity: 0.8;
	}

	.dt-pin-btn {
		padding: var(--spacing-xs) var(--spacing-sm);
		background: transparent;
		border: none;
		opacity: 0.5;
		font-size: 14px;
		cursor: pointer;
		transition: opacity 0.15s ease;
	}

	.dt-pin-btn:hover {
		opacity: 1;
	}

	.dt-pin-btn.pinned {
		opacity: 1;
	}

	/* Mobile Responsive Styles */
	@media (max-width: 640px) {
		.roster-toolbar {
			flex-wrap: wrap;
			padding: var(--spacing-sm) var(--spacing-md);
		}

		.roster-search {
			max-width: unset;
			width: 100%;
		}

		.view-toggle {
			width: 100%;
			justify-content: flex-start;
		}
	}

	/* Tablet Responsive Styles */
	@media (min-width: 641px) and (max-width: 1024px) {
		.roster-search {
			max-width: 300px;
		}
	}
</style>
