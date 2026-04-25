<script lang="ts">
	import type { PersonnelLookup } from '$lib/types';
	import { RATING_STATUS_COLORS, WORKFLOW_STATUS_OPTIONS } from '$features/rating-scheme/rating-scheme.types';
	import { ratingSchemeStore } from '$features/rating-scheme/stores/ratingScheme.svelte';
	import { subscriptionStore } from '$lib/stores/subscription.svelte';
	import { toastStore } from '$lib/stores/toast.svelte';
	import FloatingPageToolbar from '$lib/components/FloatingPageToolbar.svelte';
	import RatingSchemeTableView from '$features/rating-scheme/components/RatingSchemeTableView.svelte';
	import RatingSchemeGroupedView from '$features/rating-scheme/components/RatingSchemeGroupedView.svelte';
	import { exportRatingScheme } from '$features/rating-scheme/utils/ratingSchemeExport';
	import type { RatingSchemePageContext } from '$features/rating-scheme/contexts/RatingSchemePageContext.svelte';

	interface Props {
		ctx: RatingSchemePageContext;
		personnelLookup: PersonnelLookup[];
	}

	let { ctx, personnelLookup }: Props = $props();

	let exportLoading = $state(false);
	const readOnly = $derived(subscriptionStore.billingEnabled && subscriptionStore.isReadOnly);
	const canViewRatingScheme = $derived(ctx.canViewRatingScheme);
	const canEditRatingScheme = $derived(ctx.canEditRatingScheme);
	const ratingStats = $derived(ctx.ratingStats);
	const activeRatingFilterCount = $derived(
		(ctx.evalTypeFilter !== 'all' ? 1 : 0) +
			(ctx.ratingFilter !== 'active' ? 1 : 0) +
			(ctx.workflowFilter !== 'all' ? 1 : 0)
	);
	const ratingFilterSummary = $derived(activeRatingFilterCount > 0 ? `${activeRatingFilterCount} active` : 'Default');
	const ratingShownLabel = $derived(`${ctx.filteredRatingEntries.length} of ${ratingSchemeStore.items.length} shown`);

	function updateEvalTypeFilter(event: Event) {
		ctx.evalTypeFilter = (event.currentTarget as HTMLSelectElement).value as 'all' | 'OER' | 'NCOER' | 'WOER';
	}

	function updateRatingFilter(event: Event) {
		ctx.ratingFilter = (event.currentTarget as HTMLSelectElement).value as
			| 'active'
			| 'completed'
			| 'change-of-rater'
			| 'all';
	}

	function updateWorkflowFilter(event: Event) {
		ctx.workflowFilter = (event.currentTarget as HTMLSelectElement).value as
			| import('$features/rating-scheme/rating-scheme.types').WorkflowStatus
			| 'all';
	}
</script>

<svelte:head>
	<title>Evals - Troop to Task</title>
</svelte:head>

<div class="page">
	{#if !canViewRatingScheme}
		<div class="no-permission">
			<h2>Access Restricted</h2>
			<p>You don't have permission to view this area. Contact your organization admin for access.</p>
		</div>
	{:else}
		<main class="page-content">
			<section class="evals-section">
				<FloatingPageToolbar ariaLabel="Evaluation controls">
					{#snippet leading()}
						<div class="rating-status-ledger" aria-label="Evaluation status summary">
							<div class="rating-ledger-item" style="--stat-color: {RATING_STATUS_COLORS.overdue}">
								<span class="stat-count">{ratingStats.overdue}</span>
								<span class="stat-label">Overdue</span>
							</div>
							<div class="rating-ledger-item" style="--stat-color: {RATING_STATUS_COLORS['due-60']}">
								<span class="stat-count">{ratingStats['due-60']}</span>
								<span class="stat-label">60d</span>
							</div>
							<div class="rating-ledger-item" style="--stat-color: {RATING_STATUS_COLORS['due-30']}">
								<span class="stat-count">{ratingStats['due-30']}</span>
								<span class="stat-label">30d</span>
							</div>
						</div>
					{/snippet}

					<span class="rating-shown">{ratingShownLabel}</span>
					<div class="view-toggle">
						<div class="view-toggle-controls" role="group" aria-label="Evaluation view mode">
							<button
								class="view-btn"
								type="button"
								aria-pressed={ctx.ratingViewMode === 'grouped'}
								class:active={ctx.ratingViewMode === 'grouped'}
								onclick={() => (ctx.ratingViewMode = 'grouped')}
							>
								Grouped
							</button>
							<button
								class="view-btn"
								type="button"
								aria-pressed={ctx.ratingViewMode === 'table'}
								class:active={ctx.ratingViewMode === 'table'}
								onclick={() => (ctx.ratingViewMode = 'table')}
							>
								Table
							</button>
						</div>
					</div>
					<details class="filter-disclosure">
						<summary>
							<span>Filters</span>
							<span class="filter-summary">{ratingFilterSummary}</span>
						</summary>
						<div class="rating-filter-panel">
							<label class="filter-field">
								<span>Eval Type</span>
								<select class="select rating-filter" value={ctx.evalTypeFilter} onchange={updateEvalTypeFilter}>
									<option value="all">All Types</option>
									<option value="OER">OER</option>
									<option value="NCOER">NCOER</option>
									<option value="WOER">WOER</option>
								</select>
							</label>
							<label class="filter-field">
								<span>Status</span>
								<select class="select rating-filter" value={ctx.ratingFilter} onchange={updateRatingFilter}>
									<option value="active">Active</option>
									<option value="completed">Completed</option>
									<option value="change-of-rater">Change of Rater</option>
									<option value="all">All Statuses</option>
								</select>
							</label>
							{#if ctx.hasAnyWorkflowStatus}
								<label class="filter-field">
									<span>Workflow</span>
									<select class="select rating-filter" value={ctx.workflowFilter} onchange={updateWorkflowFilter}>
										<option value="all">All Workflow</option>
										{#each WORKFLOW_STATUS_OPTIONS as opt (opt.value)}
											<option value={opt.value}>{opt.label}</option>
										{/each}
									</select>
								</label>
							{/if}
						</div>
					</details>
					<button
						class="btn btn-sm btn-secondary"
						type="button"
						disabled={exportLoading}
						onclick={async () => {
							exportLoading = true;
							try {
								await exportRatingScheme(ctx.filteredRatingEntries, personnelLookup);
							} catch (err) {
								toastStore.error(err instanceof Error ? err.message : 'Export failed');
							} finally {
								exportLoading = false;
							}
						}}
					>
						{exportLoading ? 'Exporting...' : 'Export'}
					</button>
					{#if canEditRatingScheme}
						<button
							class="btn btn-sm btn-primary"
							type="button"
							onclick={() => ctx.handleAddRatingEntry()}
							disabled={readOnly}
						>
							Add Entry
						</button>
					{/if}
				</FloatingPageToolbar>

				<div class="evals-content">
					{#if ctx.ratingViewMode === 'grouped'}
						<RatingSchemeGroupedView
							entries={ctx.filteredRatingEntries}
							personnel={personnelLookup}
							onEdit={canEditRatingScheme ? (entry) => ctx.handleEditRatingEntry(entry) : undefined}
						/>
					{:else}
						<RatingSchemeTableView
							entries={ctx.filteredRatingEntries}
							personnel={personnelLookup}
							onEdit={canEditRatingScheme ? (entry) => ctx.handleEditRatingEntry(entry) : undefined}
						/>
					{/if}
				</div>
			</section>
		</main>
	{/if}
</div>

<style>
	.page {
		height: 100%;
		min-height: 0;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		background: color-mix(in srgb, var(--surface-page) 92%, var(--surface-panel) 8%);
	}

	.page-content {
		flex: 1;
		display: flex;
		min-height: 0;
		overflow: hidden;
		padding: var(--sp-4) var(--sp-6) var(--sp-5);
	}

	.evals-section {
		width: 100%;
		height: 100%;
		min-height: 0;
		display: flex;
		flex-direction: column;
		gap: var(--sp-4);
		overflow: hidden;
	}

	.rating-status-ledger {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--sp-2);
		min-width: 0;
	}

	.rating-ledger-item {
		display: inline-flex;
		align-items: baseline;
		gap: var(--sp-2);
		min-height: 34px;
		padding: 5px 10px;
		border: 1px solid var(--border-default);
		border-radius: var(--radius-sm);
		background: color-mix(in srgb, var(--surface-panel) 88%, var(--surface-subtle) 12%);
	}

	.stat-count {
		font-family: var(--font-display);
		font-size: var(--text-xl);
		font-weight: var(--font-weight-display);
		line-height: 1;
		color: var(--stat-color);
	}

	.stat-label,
	.rating-shown,
	.filter-field span {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--text-tertiary);
	}

	.rating-shown {
		white-space: nowrap;
	}

	.view-toggle-controls {
		display: inline-flex;
		align-items: stretch;
	}

	.view-toggle-controls .view-btn + .view-btn {
		margin-left: -1px;
	}

	.view-btn {
		appearance: none;
		min-height: 34px;
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

	.view-btn:hover,
	.filter-disclosure summary:hover {
		background: var(--surface-subtle);
		color: var(--text-primary);
	}

	.view-btn.active {
		background: color-mix(in srgb, var(--amber-light) 86%, var(--surface-panel) 14%);
		border-color: var(--amber);
		color: var(--amber-dark);
	}

	.filter-disclosure {
		position: relative;
	}

	.filter-disclosure summary {
		display: inline-flex;
		align-items: center;
		gap: var(--sp-2);
		min-height: 34px;
		padding: 0 12px;
		border: var(--border-thin);
		border-radius: var(--radius-sm);
		background: var(--surface-panel);
		color: var(--text-secondary);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.1em;
		text-transform: uppercase;
		cursor: pointer;
		list-style: none;
	}

	.filter-disclosure summary::-webkit-details-marker {
		display: none;
	}

	.filter-disclosure summary:focus-visible {
		outline: var(--focus-outline);
		outline-offset: var(--focus-outline-offset);
		box-shadow: var(--focus-ring);
	}

	.filter-summary {
		color: var(--amber-dark);
	}

	.rating-filter-panel {
		position: absolute;
		top: calc(100% + var(--sp-2));
		right: 0;
		z-index: var(--z-dropdown);
		display: grid;
		grid-template-columns: minmax(150px, 1fr);
		gap: var(--sp-3);
		min-width: 240px;
		padding: var(--sp-4);
		border: var(--border-thin);
		border-radius: var(--radius-md);
		background: var(--surface-panel);
		box-shadow: var(--shadow-lg);
	}

	.filter-field {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
	}

	.rating-filter {
		width: auto;
		min-width: 136px;
		font-size: var(--text-sm);
	}

	.evals-content {
		flex: 1;
		min-height: 0;
		overflow: auto;
		background: var(--surface-panel);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-md);
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

	@media (max-width: 640px) {
		.page-content {
			padding: var(--sp-3);
		}

		.rating-status-ledger {
			display: grid;
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}

		.rating-ledger-item {
			justify-content: space-between;
		}

		.rating-filter-panel {
			position: static;
			margin-top: var(--sp-2);
			min-width: 100%;
			box-shadow: none;
		}

		.view-btn,
		.filter-disclosure summary {
			min-height: 44px;
		}
	}
</style>
