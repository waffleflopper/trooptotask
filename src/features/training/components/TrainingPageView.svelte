<script lang="ts">
	import { goto } from '$app/navigation';
	import { trainingTypesStore } from '$features/training/stores/trainingTypes.svelte';
	import { trainingViewsStore } from '$features/training/stores/trainingViews.svelte';
	import { personnelTrainingsStore } from '$features/training/stores/personnelTrainings.svelte';
	import { filterColumnsByView } from '$features/training/utils/viewFiltering';
	import { getTrainingStats } from '$features/training/utils/trainingStatus';
	import TrainingMatrix from '$features/training/components/TrainingMatrix.svelte';
	import ViewSelector from '$features/training/components/ViewSelector.svelte';
	import ViewEditorModal from '$features/training/components/ViewEditorModal.svelte';
	import PageToolbar from '$lib/components/PageToolbar.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import SkeletonBlock from '$lib/components/ui/SkeletonBlock.svelte';
	import SkeletonGrid from '$lib/components/ui/SkeletonGrid.svelte';
	import { pinnedGroupsStore } from '$lib/stores/pinnedGroups.svelte';
	import type { TrainingPageContext } from '$features/training/contexts/TrainingPageContext.svelte';
	import type { ModalRegistry } from '$lib/utils/modalRegistry.svelte';

	let { ctx, modals }: { ctx: TrainingPageContext; modals: ModalRegistry } = $props();

	const loading = $derived(personnelTrainingsStore.loading);
	let showViewEditor = $state(false);

	const activeView = $derived(ctx.selectedViewId ? (trainingViewsStore.getById(ctx.selectedViewId) ?? null) : null);

	const filteredTypes = $derived(filterColumnsByView(trainingTypesStore.items, activeView));

	const viewStats = $derived(getTrainingStats(ctx.filteredPersonnel, filteredTypes, personnelTrainingsStore.items));
</script>

<div class="page">
	<PageToolbar title="Training & Certifications" helpTopic="training-records" overflowItems={ctx.trainingOverflowItems}>
		<button class="btn btn-sm" type="button" onclick={() => modals.open('sign-in-rosters')}>Sign-In Rosters</button>
		<a href={`/org/${ctx.orgId}/training/reports`} class="btn btn-sm"> Reports </a>
		{#if ctx.canManageConfig}
			<a href={`/org/${ctx.orgId}/training/types`} class="btn btn-sm"> Manage Types </a>
		{/if}
		{#if ctx.readOnly}
			<span class="text-muted" style="font-size: var(--text-xs);">Upgrade to edit</span>
		{/if}
	</PageToolbar>

	{#if !ctx.canViewTraining}
		<div class="no-permission">
			<h2>Access Restricted</h2>
			<p>You don't have permission to view this area. Contact your organization admin for access.</p>
		</div>
	{:else}
		<div class="stats-bar">
			{#if loading}
				{#each Array(5) as _}
					<SkeletonBlock width="100px" height="52px" />
				{/each}
			{:else}
				<div class="stat-card current">
					<span class="stat-value">{viewStats.current}</span>
					<span class="stat-label">Current</span>
				</div>
				<div class="stat-card warning-yellow">
					<span class="stat-value">{viewStats.warningYellow}</span>
					<span class="stat-label">Expiring (60d)</span>
				</div>
				<div class="stat-card warning-orange">
					<span class="stat-value">{viewStats.warningOrange}</span>
					<span class="stat-label">Expiring (30d)</span>
				</div>
				<div class="stat-card expired">
					<span class="stat-value">{viewStats.expired}</span>
					<span class="stat-label">Expired</span>
				</div>
				<div class="stat-card not-completed">
					<span class="stat-value">{viewStats.notCompleted}</span>
					<span class="stat-label">Not Done</span>
				</div>
			{/if}
		</div>

		<div class="filter-bar">
			<div class="filter-controls">
				<ViewSelector
					selectedViewId={ctx.selectedViewId}
					onSelect={(viewId) => ctx.setSelectedViewId(viewId)}
					canEdit={ctx.canManageConfig && !ctx.readOnly}
					onEditClick={() => (showViewEditor = true)}
				/>
				<label class="filter-label">
					<span class="filter-label-text">Group</span>
					<select
						class="select"
						value={ctx.selectedGroupId}
						onchange={(event) => ctx.setSelectedGroupId((event.currentTarget as HTMLSelectElement).value)}
					>
						<option value="">All Groups</option>
						{#each ctx.groups as group (group.id)}
							<option value={group.id}>{group.name}</option>
						{/each}
					</select>
				</label>
			</div>
			<div class="view-toggle">
				<span class="view-label">View:</span>
				<div class="view-toggle-controls" role="group" aria-label="Training matrix view mode">
					<button
						class="view-btn"
						type="button"
						class:active={ctx.viewMode === 'alphabetical'}
						onclick={() => ctx.setViewMode('alphabetical')}
					>
						A-Z
					</button>
					<button
						class="view-btn"
						type="button"
						class:active={ctx.viewMode === 'by-group'}
						onclick={() => ctx.setViewMode('by-group')}
					>
						By Group
					</button>
				</div>
			</div>
			<div class="filter-meta">
				<Badge label={`${ctx.filteredPersonnel.length} personnel`} variant="outlined" />
			</div>
		</div>

		<main class="page-content">
			{#if loading}
				<div class="skeleton-matrix-wrapper">
					<SkeletonGrid rows={8} columns={6} cellWidth="100px" cellHeight="38px" />
				</div>
			{:else if trainingTypesStore.items.length === 0}
				<EmptyState
					message="No training types defined yet."
					actionLabel={ctx.canEditTraining ? 'Manage Types' : undefined}
					onAction={ctx.canEditTraining ? () => goto(`/org/${ctx.orgId}/training/types`) : undefined}
				/>
			{:else if ctx.filteredPersonnel.length === 0}
				<EmptyState message="No personnel found." />
			{:else}
				<div class="view-panel" data-testid="training-matrix" class:hidden-view={ctx.viewMode !== 'alphabetical'}>
					<TrainingMatrix
						personnel={ctx.filteredPersonnel}
						trainingTypes={filteredTypes}
						trainings={personnelTrainingsStore.items}
						onCellClick={ctx.canEditTraining ? ctx.handleCellClick.bind(ctx) : undefined}
						onPersonClick={ctx.canEditTraining ? ctx.handlePersonClick.bind(ctx) : undefined}
					/>
				</div>
				<div class="view-panel" class:hidden-view={ctx.viewMode !== 'by-group'}>
					<TrainingMatrix
						personnel={ctx.filteredPersonnel}
						trainingTypes={filteredTypes}
						trainings={personnelTrainingsStore.items}
						onCellClick={ctx.canEditTraining ? ctx.handleCellClick.bind(ctx) : undefined}
						onPersonClick={ctx.canEditTraining ? ctx.handlePersonClick.bind(ctx) : undefined}
						groupBy={{
							key: (p) => p.groupName || 'Unassigned',
							compare: (a, b) => {
								const aPin = pinnedGroupsStore.list.includes(a) ? 0 : 1;
								const bPin = pinnedGroupsStore.list.includes(b) ? 0 : 1;
								if (aPin !== bPin) return aPin - bPin;
								return a.localeCompare(b);
							}
						}}
					/>
				</div>
			{/if}
		</main>
	{/if}
</div>

{#if showViewEditor}
	<ViewEditorModal onClose={() => (showViewEditor = false)} orgId={ctx.orgId} readOnly={ctx.readOnly} />
{/if}

<style>
	.page {
		height: 100%;
		display: flex;
		flex-direction: column;
		background: var(--surface-page);
	}

	.stats-bar {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
		gap: var(--sp-2);
		padding: var(--sp-2) var(--sp-3);
		background: color-mix(in srgb, var(--surface-panel) 94%, var(--surface-subtle) 6%);
		border-bottom: var(--border-thin);
	}

	.stat-card {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--sp-1);
		padding: var(--sp-2) var(--sp-3);
		border: var(--border-thin);
		border-radius: var(--radius-md);
		background: var(--surface-panel);
		--stat-color: var(--text-secondary);
	}

	.stat-card.current {
		--stat-color: var(--success);
	}

	.stat-card.warning-yellow,
	.stat-card.warning-orange {
		--stat-color: var(--amber-dark);
	}

	.stat-card.expired {
		--stat-color: var(--danger);
	}

	.stat-card.not-completed {
		--stat-color: var(--text-secondary);
	}

	.stat-value {
		display: block;
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
		text-transform: uppercase;
		letter-spacing: 0.1em;
		color: var(--text-tertiary);
	}

	.filter-bar {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--sp-2);
		padding: var(--sp-2) var(--sp-3);
		background: color-mix(in srgb, var(--surface-subtle) 72%, var(--surface-panel) 28%);
		border-bottom: var(--border-thin);
	}

	.filter-controls {
		display: flex;
		align-items: flex-end;
		flex-wrap: wrap;
		gap: var(--sp-2);
		margin-right: auto;
		min-width: 0;
	}

	.filter-label {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--sp-2);
	}

	.filter-label .select {
		width: 200px;
	}

	.filter-label-text {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--text-tertiary);
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

	.page-content {
		flex: 1;
		min-height: 0;
		overflow: hidden;
	}

	.view-panel {
		height: 100%;
		overflow: auto;
		padding: 0;
	}

	.hidden-view {
		display: none;
	}

	.skeleton-matrix-wrapper {
		padding: var(--sp-2) var(--sp-3);
		overflow: hidden;
	}

	@media (max-width: 640px) {
		.stats-bar {
			padding: var(--sp-2);
		}

		.filter-bar,
		.view-panel,
		.skeleton-matrix-wrapper {
			padding-left: var(--sp-2);
			padding-right: var(--sp-2);
		}

		.filter-bar {
			align-items: stretch;
		}

		.filter-controls,
		.filter-label {
			width: 100%;
		}

		.filter-label .select {
			width: 100%;
		}

		.filter-controls {
			margin-right: 0;
		}

		.view-toggle {
			justify-content: space-between;
		}
	}

	@media (min-width: 641px) and (max-width: 1024px) {
		.stats-bar,
		.filter-bar,
		.view-panel,
		.skeleton-matrix-wrapper {
			padding-left: var(--sp-3);
			padding-right: var(--sp-3);
		}
	}
</style>
