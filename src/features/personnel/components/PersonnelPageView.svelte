<script lang="ts">
	import { RATING_STATUS_COLORS, WORKFLOW_STATUS_OPTIONS } from '$features/rating-scheme/rating-scheme.types';
	import { personnelStore } from '$features/personnel/stores/personnel.svelte';
	import { pinnedGroupsStore } from '$lib/stores/pinnedGroups.svelte';
	import { ratingSchemeStore } from '$features/rating-scheme/stores/ratingScheme.svelte';
	import { subscriptionStore } from '$lib/stores/subscription.svelte';
	import RatingSchemeTableView from '$features/rating-scheme/components/RatingSchemeTableView.svelte';
	import RatingSchemeGroupedView from '$features/rating-scheme/components/RatingSchemeGroupedView.svelte';
	import PageToolbar from '$lib/components/PageToolbar.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import type { OverflowItem } from '$lib/components/ui/OverflowMenu.types';
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
		onPageViewChange: (view: 'roster' | 'rating-scheme') => void;
	}

	let { ctx, allPersonnel, permissions, onPageViewChange }: Props = $props();

	let exportLoading = $state(false);
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
			<button class="btn-ghost" type="button" onclick={() => ctx.openGroupManager()} disabled={readOnly}>
				Manage Groups
			</button>
			<button
				class="btn btn-sm btn-primary"
				type="button"
				data-testid="add-personnel-btn"
				onclick={() => ctx.handleAdd()}
				disabled={readOnly}
			>
				Add Person
			</button>
			{#if readOnly}
				<span class="text-muted" style="font-size: var(--text-xs);">Upgrade to edit</span>
			{/if}
		{/if}
	</PageToolbar>

	{#if !permissions?.canViewPersonnel}
		<div class="no-permission">
			<h2>Access Restricted</h2>
			<p>You don't have permission to view this area. Contact your organization admin for access.</p>
		</div>
	{:else}
		<div class="page-view-shell">
			<div class="page-view-toggle" role="tablist" aria-label="Personnel page views">
				<button
					class="page-view-btn"
					type="button"
					role="tab"
					aria-selected={ctx.pageView === 'roster'}
					class:active={ctx.pageView === 'roster'}
					onclick={() => onPageViewChange('roster')}
				>
					Roster
				</button>
				<button
					class="page-view-btn"
					type="button"
					role="tab"
					aria-selected={ctx.pageView === 'rating-scheme'}
					class:active={ctx.pageView === 'rating-scheme'}
					onclick={() => onPageViewChange('rating-scheme')}
				>
					Rating Scheme
				</button>
			</div>
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
									<div class="roster-toolbar-copy">
										<span class="roster-kicker">Personnel roster</span>
										<div class="roster-meta">
											<Badge label={`${personnelStore.items.length} total`} variant="outlined" />
											{#if tbl.search && tbl.totalRows !== personnelStore.items.length}
												<Badge label={`${tbl.totalRows} shown`} />
											{/if}
										</div>
									</div>
									<input
										type="search"
										class="input roster-search"
										data-testid="personnel-search"
										placeholder="Search by name, rank, or role..."
										bind:value={rosterSearch}
									/>
									<div class="view-toggle">
										<span class="view-label">View:</span>
										<div class="view-toggle-controls" role="group" aria-label="Roster sort mode">
											<button
												class="view-btn"
												type="button"
												class:active={ctx.viewMode === 'alphabetical'}
												onclick={() => (ctx.viewMode = 'alphabetical')}
											>
												A-Z
											</button>
											<button
												class="view-btn"
												type="button"
												class:active={ctx.viewMode === 'by-group'}
												onclick={() => (ctx.viewMode = 'by-group')}
											>
												By Group
											</button>
										</div>
									</div>
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
									<button class="dt-group-toggle" type="button" onclick={group.toggle}>
										<span class="dt-toggle-icon">{group.collapsed ? '▶' : '▼'}</span>
										<span class="dt-group-label">{group.label}</span>
										<span class="dt-group-count">{group.count}</span>
									</button>
									<button
										class="dt-pin-btn"
										type="button"
										class:pinned={pinnedGroupsStore.list.includes(group.key)}
										onclick={() => pinnedGroupsStore.toggle(group.key)}
										title={pinnedGroupsStore.list.includes(group.key) ? 'Unpin group' : 'Pin group to top'}
									>
										{pinnedGroupsStore.list.includes(group.key) ? 'Pinned' : 'Pin'}
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
						<span class="text-muted" style="font-size: var(--text-xs);">Upgrade to edit</span>
					{/if}
				{/if}
				<button
					class="btn btn-sm btn-secondary"
					type="button"
					disabled={exportLoading}
					onclick={async () => {
						exportLoading = true;
						try {
							await exportRatingScheme(ctx.filteredRatingEntries, personnelStore.items);
						} catch (err) {
							alert(err instanceof Error ? err.message : 'Export failed');
						} finally {
							exportLoading = false;
						}
					}}
				>
					{exportLoading ? 'Exporting…' : 'Export'}
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
					<div class="view-toggle-controls" role="group" aria-label="Rating scheme view mode">
						<button
							class="view-btn"
							type="button"
							class:active={ctx.ratingViewMode === 'grouped'}
							onclick={() => (ctx.ratingViewMode = 'grouped')}
						>
							Grouped
						</button>
						<button
							class="view-btn"
							type="button"
							class:active={ctx.ratingViewMode === 'table'}
							onclick={() => (ctx.ratingViewMode = 'table')}
						>
							Table
						</button>
					</div>
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
		background: var(--surface-page);
	}

	.page-view-shell {
		padding: var(--sp-4) var(--sp-6);
		border-bottom: var(--border-thin);
		background: color-mix(in srgb, var(--surface-panel) 92%, var(--surface-subtle) 8%);
	}

	.page-view-toggle {
		display: inline-flex;
		align-items: stretch;
		border: var(--border-thin);
		border-radius: var(--radius-md);
		overflow: hidden;
		background: var(--surface-panel);
	}

	.btn-ghost {
		appearance: none;
		display: flex;
		align-items: center;
		min-height: 34px;
		padding: 7px 12px;
		border: 1px solid transparent;
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--text-secondary);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.1em;
		text-transform: uppercase;
		cursor: pointer;
		transition:
			background-color var(--transition-fast),
			border-color var(--transition-fast),
			color var(--transition-fast);
	}

	.btn-ghost:hover {
		color: var(--text-primary);
		border-color: var(--border-default);
		background: var(--surface-subtle);
	}

	.page-view-btn {
		appearance: none;
		min-height: 36px;
		padding: 0 16px;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.12em;
		text-transform: uppercase;
		border: none;
		background: transparent;
		color: var(--text-secondary);
		cursor: pointer;
		transition:
			background-color var(--transition-fast),
			color var(--transition-fast);
	}

	.page-view-btn.active {
		background: color-mix(in srgb, var(--amber-light) 86%, var(--surface-panel) 14%);
		color: var(--amber-dark);
	}

	.rating-stats-bar {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
		gap: var(--sp-3);
		padding: var(--sp-4) var(--sp-6);
		border-bottom: var(--border-thin);
		background: color-mix(in srgb, var(--surface-panel) 94%, var(--surface-subtle) 6%);
	}

	.rating-stat {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--sp-1);
		padding: var(--sp-3) var(--sp-4);
		border: var(--border-thin);
		border-radius: var(--radius-md);
		background: var(--surface-panel);
	}

	.stat-count {
		font-family: var(--font-display);
		font-size: clamp(1.35rem, 1.1rem + 0.4vw, 1.8rem);
		font-weight: var(--font-weight-display);
		line-height: 1;
		color: var(--stat-color);
	}

	.stat-label {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--text-tertiary);
	}

	.rating-toolbar {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--sp-3);
		padding: var(--sp-3) var(--sp-6);
		border-bottom: var(--border-thin);
		background: color-mix(in srgb, var(--surface-subtle) 72%, var(--surface-panel) 28%);
	}

	.rating-filter {
		width: auto;
		min-width: 136px;
		font-size: var(--text-sm);
	}

	.roster-toolbar {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--sp-3);
		padding: var(--sp-4) var(--sp-5);
		border-bottom: var(--border-thin);
		background: color-mix(in srgb, var(--surface-subtle) 72%, var(--surface-panel) 28%);
	}

	.roster-toolbar-copy {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
		margin-right: auto;
		min-width: 0;
	}

	.roster-kicker {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--amber-dark);
	}

	.roster-meta {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--sp-2);
	}

	.roster-search {
		flex: 1 1 260px;
		max-width: 360px;
	}

	.view-toggle {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		flex-wrap: wrap;
	}

	.view-toggle-controls {
		display: inline-flex;
		align-items: stretch;
	}

	.view-toggle-controls .view-btn + .view-btn {
		margin-left: -1px;
	}

	.view-label {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--text-tertiary);
	}

	.view-btn {
		appearance: none;
		min-height: 32px;
		padding: 0 12px;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.1em;
		text-transform: uppercase;
		border: var(--border-thin);
		background: var(--surface-panel);
		color: var(--text-secondary);
		cursor: pointer;
		transition:
			background-color var(--transition-fast),
			border-color var(--transition-fast),
			color var(--transition-fast);
	}

	.view-btn:first-of-type {
		border-radius: var(--radius-sm) 0 0 var(--radius-sm);
	}

	.view-btn:last-of-type {
		border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
	}

	.view-btn:hover {
		background: var(--surface-subtle);
		color: var(--text-primary);
	}

	.view-btn.active {
		background: color-mix(in srgb, var(--amber-light) 86%, var(--surface-panel) 14%);
		border-color: var(--amber);
		color: var(--amber-dark);
	}

	.no-permission {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		min-height: 320px;
		margin: var(--sp-6);
		padding: var(--sp-8);
		text-align: center;
		color: var(--text-secondary);
		background: var(--surface-panel);
		border: var(--border-thin);
		border-radius: var(--radius-lg);
	}

	.no-permission h2 {
		margin: 0 0 var(--sp-2);
		font-family: var(--font-display);
		font-size: clamp(1.5rem, 1.2rem + 0.8vw, 2.1rem);
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: var(--text-primary);
	}

	.no-permission p {
		margin: 0;
		max-width: 44ch;
		line-height: var(--line-height-copy);
	}

	.cell-rank {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--amber-dark);
	}

	.cell-name {
		font-size: var(--text-sm);
		font-weight: var(--font-weight-semibold);
		color: var(--text-primary);
	}

	.dt-group-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--sp-3);
		width: 100%;
	}

	.dt-group-toggle {
		flex: 1;
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		padding: 9px 0;
		background: transparent;
		border: none;
		color: var(--text-secondary);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.12em;
		text-transform: uppercase;
		cursor: pointer;
		text-align: left;
	}

	.dt-toggle-icon {
		font-size: 10px;
		width: 12px;
		color: var(--amber-dark);
	}

	.dt-group-label {
		color: var(--text-primary);
	}

	.dt-group-count {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 22px;
		min-height: 22px;
		padding: 3px 6px;
		border: var(--border-thin);
		border-radius: var(--radius-sm);
		background: var(--surface-panel);
		color: var(--text-secondary);
		font-size: var(--text-xs);
		letter-spacing: 0.08em;
	}

	.dt-pin-btn {
		appearance: none;
		min-height: 28px;
		padding: 0 10px;
		border: var(--border-thin);
		border-radius: var(--radius-sm);
		background: var(--surface-panel);
		color: var(--text-tertiary);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		cursor: pointer;
		transition:
			background-color var(--transition-fast),
			border-color var(--transition-fast),
			color var(--transition-fast);
	}

	.dt-pin-btn:hover {
		background: var(--surface-subtle);
		border-color: var(--ink-35);
		color: var(--text-primary);
	}

	.dt-pin-btn.pinned {
		border-color: var(--amber);
		background: var(--amber-light);
		color: var(--amber-dark);
	}

	@media (max-width: 640px) {
		.page-view-shell,
		.rating-stats-bar,
		.rating-toolbar {
			padding-left: var(--sp-4);
			padding-right: var(--sp-4);
		}

		.roster-toolbar {
			flex-wrap: wrap;
			padding: var(--sp-4);
		}

		.roster-search {
			max-width: unset;
			width: 100%;
		}

		.view-toggle {
			width: 100%;
			justify-content: flex-start;
		}

		.rating-filter {
			min-width: unset;
			width: 100%;
		}
	}

	@media (min-width: 641px) and (max-width: 1024px) {
		.roster-search {
			max-width: 300px;
		}
	}
</style>
