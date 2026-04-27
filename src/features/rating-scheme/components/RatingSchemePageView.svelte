<script lang="ts">
	import type { PersonnelLookup } from '$lib/types';
	import { RATING_STATUS_COLORS, WORKFLOW_STATUS_OPTIONS } from '$features/rating-scheme/rating-scheme.types';
	import { ratingSchemeStore } from '$features/rating-scheme/stores/ratingScheme.svelte';
	import { subscriptionStore } from '$lib/stores/subscription.svelte';
	import { toastStore } from '$lib/stores/toast.svelte';
	import {
		Toolbar,
		ToolbarActions,
		ToolbarFilterSelect,
		ToolbarGroup,
		ToolbarViewToggle,
		type ToolbarActionConfig
	} from '$lib/components/ui/toolbar';
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
	const ratingViewOptions = [
		{ value: 'grouped', label: 'Grouped' },
		{ value: 'table', label: 'Table' }
	];
	const evalTypeFilterOptions = [
		{ value: 'all', label: 'Eval Type: All' },
		{ value: 'OER', label: 'OER' },
		{ value: 'NCOER', label: 'NCOER' },
		{ value: 'WOER', label: 'WOER' }
	];
	const ratingFilterOptions = [
		{ value: 'active', label: 'Status: Active' },
		{ value: 'completed', label: 'Completed' },
		{ value: 'change-of-rater', label: 'Change of Rater' },
		{ value: 'all', label: 'All Statuses' }
	];
	const workflowFilterOptions = $derived([
		{ value: 'all', label: 'Workflow: All' },
		...WORKFLOW_STATUS_OPTIONS.map((opt) => ({ value: opt.value, label: opt.label }))
	]);
	const readOnly = $derived(subscriptionStore.billingEnabled && subscriptionStore.isReadOnly);
	const canViewRatingScheme = $derived(ctx.canViewRatingScheme);
	const canEditRatingScheme = $derived(ctx.canEditRatingScheme);
	const ratingStats = $derived(ctx.ratingStats);
	const ratingShownLabel = $derived(`${ctx.filteredRatingEntries.length} of ${ratingSchemeStore.items.length} shown`);
	const activeFilterCount = $derived(
		(ctx.evalTypeFilter !== 'all' ? 1 : 0) +
			(ctx.ratingFilter !== 'active' ? 1 : 0) +
			(ctx.hasAnyWorkflowStatus && ctx.workflowFilter !== 'all' ? 1 : 0) +
			(ctx.ratingViewMode !== 'grouped' ? 1 : 0)
	);
	const ratingMetricItems = $derived([
		{ id: 'overdue', label: 'Overdue', value: ratingStats.overdue, color: RATING_STATUS_COLORS.overdue },
		{ id: 'due-60', label: '60d', value: ratingStats['due-60'], color: RATING_STATUS_COLORS['due-60'] },
		{ id: 'due-30', label: '30d', value: ratingStats['due-30'], color: RATING_STATUS_COLORS['due-30'] }
	]);
	const ratingActionItems = $derived.by<ToolbarActionConfig[]>(() => {
		const items: ToolbarActionConfig[] = [
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
				icon: 'download',
				priority: 'normal',
				variant: 'default'
			}
		];

		if (canEditRatingScheme) {
			items.push({
				id: 'add-entry',
				label: 'Add Entry',
				onclick: () => ctx.handleAddRatingEntry(),
				disabled: readOnly,
				priority: 'critical',
				overflow: 'never',
				variant: 'primary'
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
				<Toolbar ariaLabel="Evaluation controls" collapse="narrow" leadingMin="36rem" compactLeadingWhenCrowded>
					{#snippet leading()}
						<ToolbarGroup label="Evaluation filters" activeCount={activeFilterCount} testId="evaluation-filters">
							{#snippet full()}
								<ToolbarViewToggle
									ariaLabel="Evaluation view mode"
									options={ratingViewOptions}
									value={ctx.ratingViewMode}
									mode="full"
									onValueChange={(value) => (ctx.ratingViewMode = value as 'grouped' | 'table')}
								/>
								<ToolbarFilterSelect
									ariaLabel="Evaluation type filter"
									options={evalTypeFilterOptions}
									value={ctx.evalTypeFilter}
									defaultValue="all"
									mode="full"
									onValueChange={(value) => (ctx.evalTypeFilter = value as 'all' | 'OER' | 'NCOER' | 'WOER')}
								/>
								<ToolbarFilterSelect
									ariaLabel="Evaluation status filter"
									options={ratingFilterOptions}
									value={ctx.ratingFilter}
									defaultValue="active"
									width="wide"
									mode="full"
									onValueChange={(value) =>
										(ctx.ratingFilter = value as 'active' | 'completed' | 'change-of-rater' | 'all')}
								/>
								{#if ctx.hasAnyWorkflowStatus}
									<ToolbarFilterSelect
										ariaLabel="Evaluation workflow filter"
										options={workflowFilterOptions}
										value={ctx.workflowFilter}
										defaultValue="all"
										width="wide"
										mode="full"
										onValueChange={(value) =>
											(ctx.workflowFilter = value as
												| import('$features/rating-scheme/rating-scheme.types').WorkflowStatus
												| 'all')}
									/>
								{/if}
							{/snippet}
							{#snippet panel()}
								<ToolbarViewToggle
									ariaLabel="Evaluation view mode"
									options={ratingViewOptions}
									value={ctx.ratingViewMode}
									mode="full"
									onValueChange={(value) => (ctx.ratingViewMode = value as 'grouped' | 'table')}
								/>
								<ToolbarFilterSelect
									ariaLabel="Evaluation type filter"
									options={evalTypeFilterOptions}
									value={ctx.evalTypeFilter}
									defaultValue="all"
									mode="full"
									onValueChange={(value) => (ctx.evalTypeFilter = value as 'all' | 'OER' | 'NCOER' | 'WOER')}
								/>
								<ToolbarFilterSelect
									ariaLabel="Evaluation status filter"
									options={ratingFilterOptions}
									value={ctx.ratingFilter}
									defaultValue="active"
									width="wide"
									mode="full"
									onValueChange={(value) =>
										(ctx.ratingFilter = value as 'active' | 'completed' | 'change-of-rater' | 'all')}
								/>
								{#if ctx.hasAnyWorkflowStatus}
									<ToolbarFilterSelect
										ariaLabel="Evaluation workflow filter"
										options={workflowFilterOptions}
										value={ctx.workflowFilter}
										defaultValue="all"
										width="wide"
										mode="full"
										onValueChange={(value) =>
											(ctx.workflowFilter = value as
												| import('$features/rating-scheme/rating-scheme.types').WorkflowStatus
												| 'all')}
									/>
								{/if}
							{/snippet}
						</ToolbarGroup>
					{/snippet}

					<ToolbarActions
						actions={ratingActionItems}
						ariaLabel="Evaluation actions"
						overflowAriaLabel="More evaluation actions"
						overflowIconOnly
					/>
				</Toolbar>

				<div class="evals-content">
					<div class="evals-table-header">
						<div class="evals-table-header__stats" aria-label="Evaluation status summary">
							{#each ratingMetricItems as item (item.id)}
								<div class="evals-table-header__metric">
									<strong style:color={item.color}>{item.value}</strong>
									<span>{item.label}</span>
								</div>
							{/each}
						</div>
						<div class="evals-table-header__shown" role="status" aria-label={ratingShownLabel}>
							{ratingShownLabel}
						</div>
					</div>
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

	.evals-table-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--sp-4);
		padding: var(--sp-3) var(--sp-4);
		border-bottom: 1px solid var(--border-default);
		background: color-mix(in srgb, var(--surface-panel) 92%, var(--surface-page) 8%);
	}

	.evals-table-header__stats {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--sp-2);
	}

	.evals-table-header__metric {
		display: inline-flex;
		align-items: baseline;
		gap: var(--sp-1);
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: var(--letter-spacing-mono);
		text-transform: uppercase;
		color: var(--text-tertiary);
	}

	.evals-table-header__metric strong {
		font-size: var(--text-lg);
		line-height: 1;
	}

	.evals-table-header__shown {
		flex: 0 0 auto;
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: var(--letter-spacing-mono);
		text-transform: uppercase;
		color: var(--text-secondary);
	}

	.evals-content {
		flex: 1;
		min-height: 0;
		overflow: auto;
		background: var(--surface-panel);
		border: 1px solid var(--border-default);
		border-radius: var(--radius-md);
	}

	@media (max-width: 640px) {
		.evals-table-header {
			align-items: flex-start;
			flex-direction: column;
			gap: var(--sp-2);
		}
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
	}
</style>
