<script lang="ts">
	import { trainingTypesStore } from '$features/training/stores/trainingTypes.svelte';
	import { personnelTrainingsStore } from '$features/training/stores/personnelTrainings.svelte';
	import TrainingMatrix from '$features/training/components/TrainingMatrix.svelte';
	import PageToolbar from '$lib/components/PageToolbar.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import type { TrainingPageContext } from '$features/training/contexts/TrainingPageContext.svelte';
	import type { ModalRegistry } from '$lib/utils/modalRegistry.svelte';

	let { ctx, modals }: { ctx: TrainingPageContext; modals: ModalRegistry } = $props();
</script>

<div class="page">
	<PageToolbar title="Training & Certifications" helpTopic="training-records" overflowItems={ctx.trainingOverflowItems}>
		<button class="btn btn-sm" onclick={() => modals.open('sign-in-rosters')}> Sign-In Rosters </button>
		<button class="btn btn-sm" onclick={() => modals.open('reports')}> Reports </button>
		{#if ctx.canManageConfig}
			<button class="btn btn-sm" onclick={() => modals.open('type-manager')} disabled={ctx.readOnly}>
				Manage Types
			</button>
		{/if}
		{#if ctx.readOnly}
			<span class="text-muted" style="font-size: var(--font-size-xs);">Upgrade to edit</span>
		{/if}
	</PageToolbar>

	{#if !ctx.canViewTraining}
		<div class="no-permission">
			<h2>Access Restricted</h2>
			<p>You don't have permission to view this area. Contact your organization admin for access.</p>
		</div>
	{:else}
		<div class="stats-bar">
			<div class="stat current">
				<span class="stat-value">{ctx.stats.current}</span>
				<span class="stat-label">Current</span>
			</div>
			<div class="stat warning-yellow">
				<span class="stat-value">{ctx.stats.warningYellow}</span>
				<span class="stat-label">Expiring (60d)</span>
			</div>
			<div class="stat warning-orange">
				<span class="stat-value">{ctx.stats.warningOrange}</span>
				<span class="stat-label">Expiring (30d)</span>
			</div>
			<div class="stat expired">
				<span class="stat-value">{ctx.stats.expired}</span>
				<span class="stat-label">Expired</span>
			</div>
			<div class="stat not-completed">
				<span class="stat-value">{ctx.stats.notCompleted}</span>
				<span class="stat-label">Not Done</span>
			</div>
		</div>

		<div class="filter-bar">
			<label class="filter-label">
				Filter by Group:
				<select class="select" bind:value={ctx.selectedGroupId}>
					<option value="">All Groups</option>
					{#each ctx.groups as group (group.id)}
						<option value={group.id}>{group.name}</option>
					{/each}
				</select>
			</label>
			<div class="view-toggle">
				<span class="view-label">View:</span>
				<button
					class="view-btn"
					class:active={ctx.viewMode === 'alphabetical'}
					onclick={() => (ctx.viewMode = 'alphabetical')}
				>
					A-Z
				</button>
				<button class="view-btn" class:active={ctx.viewMode === 'by-group'} onclick={() => (ctx.viewMode = 'by-group')}>
					By Group
				</button>
			</div>
			<span class="filter-count">{ctx.filteredPersonnel.length} personnel</span>
		</div>

		<main class="page-content">
			{#if trainingTypesStore.items.length === 0}
				<EmptyState
					message="No training types defined yet."
					actionLabel={ctx.canEditTraining ? 'Manage Types' : undefined}
					onAction={ctx.canEditTraining ? () => modals.open('type-manager') : undefined}
				/>
			{:else if ctx.filteredPersonnel.length === 0}
				<EmptyState message="No personnel found." />
			{:else}
				<div class="view-panel" data-testid="training-matrix" class:hidden-view={ctx.viewMode !== 'alphabetical'}>
					<TrainingMatrix
						personnel={ctx.filteredPersonnel}
						trainingTypes={trainingTypesStore.items}
						trainings={personnelTrainingsStore.list}
						onCellClick={ctx.canEditTraining ? ctx.handleCellClick.bind(ctx) : undefined}
						onPersonClick={ctx.canEditTraining ? ctx.handlePersonClick.bind(ctx) : undefined}
					/>
				</div>
				<div class="view-panel" class:hidden-view={ctx.viewMode !== 'by-group'}>
					<div class="grouped-training">
						{#each ctx.personnelByGroup as grp (grp.group)}
							<div class="group-section">
								<button class="group-header" onclick={() => ctx.toggleGroup(grp.group)}>
									<span class="toggle-icon">{ctx.collapsedGroups.has(grp.group) ? '▶' : '▼'}</span>
									<span class="group-name">{grp.group}</span>
									<span class="group-count">({grp.personnel.length})</span>
								</button>
								{#if !ctx.collapsedGroups.has(grp.group)}
									<div class="group-content">
										<TrainingMatrix
											personnel={grp.personnel}
											trainingTypes={trainingTypesStore.items}
											trainings={personnelTrainingsStore.list}
											onCellClick={ctx.canEditTraining ? ctx.handleCellClick.bind(ctx) : undefined}
											onPersonClick={ctx.canEditTraining ? ctx.handlePersonClick.bind(ctx) : undefined}
										/>
									</div>
								{/if}
							</div>
						{/each}
					</div>
				</div>
			{/if}
		</main>
	{/if}
</div>

<style>
	.page {
		height: calc(100dvh - var(--header-height, 56px));
		display: flex;
		flex-direction: column;
		background: var(--color-bg);
	}

	.stats-bar {
		display: flex;
		gap: var(--spacing-md);
		padding: var(--spacing-md) var(--spacing-lg);
		background: var(--color-surface);
		border-bottom: 1px solid var(--color-border);
	}

	.stat {
		padding: var(--spacing-sm) var(--spacing-md);
		border-radius: var(--radius-md);
		text-align: center;
		min-width: 100px;
	}

	.stat.current {
		background-color: rgba(34, 197, 94, 0.1);
		border: 1px solid #22c55e;
	}

	.stat.warning-yellow {
		background-color: rgba(234, 179, 8, 0.1);
		border: 1px solid #eab308;
	}

	.stat.warning-orange {
		background-color: rgba(249, 115, 22, 0.1);
		border: 1px solid #f97316;
	}

	.stat.expired {
		background-color: rgba(239, 68, 68, 0.1);
		border: 1px solid #ef4444;
	}

	.stat.not-completed {
		background-color: rgba(107, 114, 128, 0.1);
		border: 1px solid #6b7280;
	}

	.stat-value {
		display: block;
		font-family: var(--font-mono);
		font-size: var(--font-size-lg);
		font-weight: 500;
	}

	.stat-label {
		font-family: var(--font-mono);
		font-size: var(--font-size-xs);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--color-text-muted);
	}

	.filter-bar {
		display: flex;
		align-items: center;
		gap: var(--spacing-lg);
		padding: var(--spacing-md) var(--spacing-lg);
		background: var(--color-surface);
		border-bottom: 1px solid var(--color-border);
	}

	.filter-label {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		font-size: var(--font-size-sm);
	}

	.filter-label .select {
		width: 200px;
	}

	.filter-count {
		font-size: var(--font-size-sm);
		color: var(--color-text-muted);
		margin-left: auto;
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

	.grouped-training {
		display: flex;
		flex-direction: column;
		gap: var(--spacing-lg);
	}

	.group-section {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		overflow: hidden;
	}

	.group-header {
		display: flex;
		align-items: center;
		gap: var(--spacing-sm);
		width: 100%;
		padding: var(--spacing-md);
		background: #0f0f0f;
		color: #f0ede6;
		font-weight: 600;
		cursor: pointer;
		border: none;
		text-align: left;
	}

	.group-header:hover {
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

	.group-content {
		padding: var(--spacing-md);
		overflow-x: auto;
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

	.page-content {
		flex: 1;
		min-height: 0;
		overflow: hidden;
	}

	.view-panel {
		height: 100%;
		overflow: auto;
	}

	.hidden-view {
		display: none;
	}

	/* Mobile Responsive Styles */
	@media (max-width: 640px) {
		.stats-bar {
			flex-wrap: wrap;
			justify-content: center;
			padding: var(--spacing-sm) var(--spacing-md);
			gap: var(--spacing-sm);
		}

		.stat {
			min-width: 70px;
			padding: var(--spacing-xs) var(--spacing-sm);
		}

		.stat-value {
			font-size: var(--font-size-base);
		}

		.stat-label {
			font-size: var(--font-size-xs);
		}

		.filter-bar {
			flex-wrap: wrap;
			padding: var(--spacing-sm) var(--spacing-md);
		}

		.filter-label {
			flex-direction: column;
			align-items: flex-start;
			width: 100%;
		}

		.filter-label .select {
			width: 100%;
		}

		.view-toggle {
			width: 100%;
			justify-content: flex-start;
		}

		.filter-count {
			width: 100%;
			margin-left: 0;
		}

		.group-content {
			padding: var(--spacing-sm);
		}
	}

	/* Tablet Responsive Styles */
	@media (min-width: 641px) and (max-width: 1024px) {
		.stats-bar {
			flex-wrap: wrap;
			justify-content: flex-start;
		}

		.stat {
			min-width: 90px;
		}
	}
</style>
