<script lang="ts">
	import type { PersonnelLookup } from '$lib/types';
	import { RATING_STATUS_COLORS, WORKFLOW_STATUS_OPTIONS } from '$features/rating-scheme/rating-scheme.types';
	import { ratingSchemeStore } from '$features/rating-scheme/stores/ratingScheme.svelte';
	import { subscriptionStore } from '$lib/stores/subscription.svelte';
	import { toastStore } from '$lib/stores/toast.svelte';
	import FloatingPageToolbar from '$lib/components/FloatingPageToolbar.svelte';
	import ProgressiveToolbarActions from '$lib/components/ui/ProgressiveToolbarActions.svelte';
	import SegmentedControl from '$lib/components/ui/SegmentedControl.svelte';
	import ToolbarSelect, { type ToolbarSelectOption } from '$lib/components/ui/ToolbarSelect.svelte';
	import RatingSchemeTableView from '$features/rating-scheme/components/RatingSchemeTableView.svelte';
	import RatingSchemeGroupedView from '$features/rating-scheme/components/RatingSchemeGroupedView.svelte';
	import { exportRatingScheme } from '$features/rating-scheme/utils/ratingSchemeExport';
	import type { RatingSchemePageContext } from '$features/rating-scheme/contexts/RatingSchemePageContext.svelte';
	import type { ProgressiveToolbarAction } from '$lib/components/ui/ProgressiveToolbarActions.types';

	interface Props {
		ctx: RatingSchemePageContext;
		personnelLookup: PersonnelLookup[];
	}

	let { ctx, personnelLookup }: Props = $props();

	let exportLoading = $state(false);
	const ratingViewOptions = [
		{ value: 'grouped', label: 'Grouped' },
		{ value: 'table', label: 'Table' }
	];
	const evalTypeFilterOptions: ToolbarSelectOption[] = [
		{ value: 'all', label: 'Eval Type: All' },
		{ value: 'OER', label: 'OER' },
		{ value: 'NCOER', label: 'NCOER' },
		{ value: 'WOER', label: 'WOER' }
	];
	const ratingFilterOptions: ToolbarSelectOption[] = [
		{ value: 'active', label: 'Status: Active' },
		{ value: 'completed', label: 'Completed' },
		{ value: 'change-of-rater', label: 'Change of Rater' },
		{ value: 'all', label: 'All Statuses' }
	];
	const workflowFilterOptions = $derived<ToolbarSelectOption[]>([
		{ value: 'all', label: 'Workflow: All' },
		...WORKFLOW_STATUS_OPTIONS.map((opt) => ({ value: opt.value, label: opt.label }))
	]);
	const readOnly = $derived(subscriptionStore.billingEnabled && subscriptionStore.isReadOnly);
	const canViewRatingScheme = $derived(ctx.canViewRatingScheme);
	const canEditRatingScheme = $derived(ctx.canEditRatingScheme);
	const ratingStats = $derived(ctx.ratingStats);
	const ratingShownLabel = $derived(`${ctx.filteredRatingEntries.length} of ${ratingSchemeStore.items.length} shown`);
	const ratingActionItems = $derived.by<ProgressiveToolbarAction[]>(() => {
		const items: ProgressiveToolbarAction[] = [
			{
				id: 'export',
				label: exportLoading ? 'Exporting...' : 'Export',
				onclick: async () => {
					exportLoading = true;
					try {
						await exportRatingScheme(ctx.filteredRatingEntries, personnelLookup);
					} catch (err) {
						toastStore.error(err instanceof Error ? err.message : 'Export failed');
					} finally {
						exportLoading = false;
					}
				},
				disabled: exportLoading,
				className: 'btn btn-sm btn-secondary'
			}
		];

		if (canEditRatingScheme) {
			items.push({
				id: 'add-entry',
				label: 'Add Entry',
				onclick: () => ctx.handleAddRatingEntry(),
				disabled: readOnly,
				className: 'btn btn-sm btn-primary'
			});
		}

		return items;
	});
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
				<FloatingPageToolbar ariaLabel="Evaluation controls" collapse="narrow" leadingMin="0">
					{#snippet leading()}
						<div class="evals-toolbar-leading">
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

							<div class="rating-filter-controls" aria-label="Evaluation filters">
								<ToolbarSelect
									ariaLabel="Evaluation type filter"
									options={evalTypeFilterOptions}
									value={ctx.evalTypeFilter}
									onValueChange={(value) => (ctx.evalTypeFilter = value as 'all' | 'OER' | 'NCOER' | 'WOER')}
								/>
								<ToolbarSelect
									ariaLabel="Evaluation status filter"
									options={ratingFilterOptions}
									value={ctx.ratingFilter}
									width="wide"
									onValueChange={(value) =>
										(ctx.ratingFilter = value as 'active' | 'completed' | 'change-of-rater' | 'all')}
								/>
								{#if ctx.hasAnyWorkflowStatus}
									<ToolbarSelect
										ariaLabel="Evaluation workflow filter"
										options={workflowFilterOptions}
										value={ctx.workflowFilter}
										width="wide"
										onValueChange={(value) =>
											(ctx.workflowFilter = value as
												| import('$features/rating-scheme/rating-scheme.types').WorkflowStatus
												| 'all')}
									/>
								{/if}
							</div>
						</div>
					{/snippet}

					<span class="rating-shown">{ratingShownLabel}</span>
					<SegmentedControl
						ariaLabel="Evaluation view mode"
						options={ratingViewOptions}
						value={ctx.ratingViewMode}
						onValueChange={(value) => (ctx.ratingViewMode = value as 'grouped' | 'table')}
					/>
					<ProgressiveToolbarActions
						items={ratingActionItems}
						overflowAriaLabel="More evaluation actions"
						overflowIconOnly
					/>
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

	.evals-toolbar-leading,
	.rating-filter-controls {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		min-width: 0;
	}

	.evals-toolbar-leading {
		flex-wrap: wrap;
	}

	.rating-filter-controls {
		flex-wrap: nowrap;
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
	.rating-shown {
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
	}
</style>
