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
			<div class="toolbar">
				<div class="toolbar-title">
					<span class="count">({ctx.totalPersonnel})</span>
				</div>
				<input
					type="text"
					class="input search-input"
					data-testid="personnel-search"
					placeholder="Search by name, rank, or role..."
					bind:value={ctx.searchQuery}
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
				{#if ctx.searchQuery && ctx.filteredCount !== ctx.totalPersonnel}
					<span class="filter-info">Showing {ctx.filteredCount} of {ctx.totalPersonnel}</span>
				{/if}
			</div>

			<main class="page-content">
				{#if ctx.totalPersonnel === 0}
					<EmptyState
						message="No personnel added yet."
						actionLabel={permissions?.canEditPersonnel ? 'Add Person' : undefined}
						onAction={permissions?.canEditPersonnel ? () => ctx.handleAdd() : undefined}
					/>
				{:else if ctx.viewMode === 'alphabetical'}
					<div class="personnel-list" data-testid="personnel-list">
						{#each ctx.alphabeticalPersonnel as person (person.id)}
							{#if permissions?.canEditPersonnel}
								<button class="person-row" onclick={() => ctx.handleEdit(person)}>
									<div class="person-info">
										<span class="rank">{person.rank}</span>
										<span class="name">{person.lastName}, {person.firstName}</span>
										{#if person.mos}
											<span class="mos">{person.mos}</span>
										{/if}
										{#if person.clinicRole}
											<span class="role">{person.clinicRole}</span>
										{/if}
										{#if person.groupName}
											<span class="group-badge">{person.groupName}</span>
										{/if}
									</div>
								</button>
							{:else}
								<div class="person-row readonly">
									<div class="person-info">
										<span class="rank">{person.rank}</span>
										<span class="name">{person.lastName}, {person.firstName}</span>
										{#if person.mos}
											<span class="mos">{person.mos}</span>
										{/if}
										{#if person.clinicRole}
											<span class="role">{person.clinicRole}</span>
										{/if}
										{#if person.groupName}
											<span class="group-badge">{person.groupName}</span>
										{/if}
									</div>
								</div>
							{/if}
						{/each}
					</div>
				{:else}
					<div class="personnel-grid">
						{#each ctx.personnelByGroup as grp (grp.group)}
							<div class="group-card">
								<div class="group-header">
									<button class="group-toggle" onclick={() => ctx.toggleGroup(grp.group)}>
										<span class="toggle-icon">{ctx.collapsedGroups.has(grp.group) ? '▶' : '▼'}</span>
										<span class="group-name">{grp.group}</span>
										<span class="group-count">({grp.personnel.length})</span>
									</button>
									<button
										class="pin-btn"
										class:pinned={pinnedGroupsStore.list.includes(grp.group)}
										onclick={() => pinnedGroupsStore.toggle(grp.group)}
										title={pinnedGroupsStore.list.includes(grp.group) ? 'Unpin group' : 'Pin group to top'}
									>
										{pinnedGroupsStore.list.includes(grp.group) ? '📌' : '📍'}
									</button>
								</div>
								{#if !ctx.collapsedGroups.has(grp.group)}
									<div class="group-personnel">
										{#each grp.personnel as person (person.id)}
											{#if permissions?.canEditPersonnel}
												<button class="person-row" onclick={() => ctx.handleEdit(person)}>
													<div class="person-info">
														<span class="rank">{person.rank}</span>
														<span class="name">{person.lastName}, {person.firstName}</span>
														{#if person.mos}
															<span class="mos">{person.mos}</span>
														{/if}
														{#if person.clinicRole}
															<span class="role">{person.clinicRole}</span>
														{/if}
													</div>
												</button>
											{:else}
												<div class="person-row readonly">
													<div class="person-info">
														<span class="rank">{person.rank}</span>
														<span class="name">{person.lastName}, {person.firstName}</span>
														{#if person.mos}
															<span class="mos">{person.mos}</span>
														{/if}
														{#if person.clinicRole}
															<span class="role">{person.clinicRole}</span>
														{/if}
													</div>
												</div>
											{/if}
										{/each}
									</div>
								{/if}
							</div>
						{/each}
					</div>
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
					onclick={() => exportRatingScheme(ctx.filteredRatingEntries, personnelStore.list)}
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

	.toolbar {
		display: flex;
		align-items: center;
		gap: var(--spacing-md);
		padding: var(--spacing-md) var(--spacing-lg);
		background: var(--color-surface);
		border-bottom: 1px solid var(--color-border);
	}

	.toolbar-title {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
	}

	.count {
		font-family: var(--font-mono);
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
	}

	.search-input {
		flex: 1;
		max-width: 400px;
	}

	.filter-info {
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
		background: #b8943e;
		border-color: #b8943e;
		color: #0f0f0f;
	}

	.personnel-list {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		padding: var(--spacing-sm);
	}

	.group-badge {
		font-family: var(--font-mono);
		font-size: var(--font-size-xs);
		color: #0f0f0f;
		background: #b8943e;
		padding: 2px var(--spacing-sm);
		border-radius: var(--radius-sm);
		margin-left: auto;
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

	.personnel-grid {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-md);
	}

	.group-card {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		overflow: hidden;
	}

	.group-header {
		display: flex;
		align-items: center;
		background: #0f0f0f;
		color: #f0ede6;
	}

	.group-toggle {
		flex: 1;
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		padding: var(--spacing-md);
		background: transparent;
		color: white;
		text-align: left;
		cursor: pointer;
		font-weight: 600;
	}

	.group-toggle:hover {
		background: #1a1a1a;
	}

	.toggle-icon {
		font-size: 10px;
		width: 12px;
	}

	.group-name {
		flex: 1;
	}

	.group-count {
		font-weight: 400;
		opacity: 0.8;
	}

	.pin-btn {
		padding: var(--spacing-md);
		background: transparent;
		color: white;
		opacity: 0.5;
		font-size: 14px;
		transition: opacity 0.15s ease;
	}

	.pin-btn:hover {
		opacity: 1;
		background: #1a1a1a;
	}

	.pin-btn.pinned {
		opacity: 1;
	}

	.group-personnel {
		padding: var(--spacing-sm);
	}

	.person-row {
		display: flex;
		align-items: center;
		width: 100%;
		padding: var(--spacing-sm) var(--spacing-md);
		border-radius: var(--radius-md);
		transition: background-color 0.15s ease;
		cursor: pointer;
		text-align: left;
		background: transparent;
		border: none;
	}

	.person-row:hover {
		background-color: var(--color-bg);
	}

	.person-row.readonly {
		cursor: default;
	}

	.person-row.readonly:hover {
		background-color: transparent;
	}

	.person-info {
		display: flex;
		align-items: center;
		gap: var(--spacing-md);
	}

	.rank {
		font-weight: 600;
		color: #b8943e;
		min-width: 40px;
	}

	.name {
		font-weight: 500;
		color: var(--color-text);
	}

	.mos {
		font-size: var(--font-size-sm);
		color: #b8943e;
		font-weight: 500;
	}

	.role {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
		padding: 2px var(--spacing-sm);
		background: var(--color-bg);
		border-radius: var(--radius-sm);
	}

	/* Mobile Responsive Styles */
	@media (max-width: 640px) {
		.toolbar {
			flex-wrap: wrap;
			padding: var(--spacing-sm) var(--spacing-md);
		}

		.search-input {
			max-width: unset;
			width: 100%;
		}

		.view-toggle {
			width: 100%;
			justify-content: flex-start;
		}

		.group-badge {
			display: none;
		}

		.group-toggle {
			padding: var(--spacing-sm);
		}

		.person-info {
			flex-wrap: wrap;
			gap: var(--spacing-sm);
		}

		.rank {
			min-width: 35px;
		}

		.mos {
			display: none; /* Hide MOS on mobile to save space */
		}

		.role {
			font-size: var(--font-size-xs);
		}
	}

	/* Tablet Responsive Styles */
	@media (min-width: 641px) and (max-width: 1024px) {
		.search-input {
			max-width: 300px;
		}
	}
</style>
