<script lang="ts">
	import type { PersonnelLookup } from '$lib/types';
	import {
		WORKFLOW_STATUS_OPTIONS,
		type RatingDueStatus,
		type WorkflowStatus
	} from '$features/rating-scheme/rating-scheme.types';
	import { ratingSchemeStore } from '$features/rating-scheme/stores/ratingScheme.svelte';
	import { toastStore } from '$lib/stores/toast.svelte';
	import * as Alert from '$lib/components/ui/alert';
	import { Button } from '$lib/components/ui/button';
	import * as ButtonGroup from '$lib/components/ui/button-group';
	import * as WorkspaceToolbar from '$lib/components/ui/workspace-toolbar';
	import type { WorkspaceToolbarAction } from '$lib/components/ui/workspace-toolbar';
	import RatingSchemeTableView from '$features/rating-scheme/components/RatingSchemeTableView.svelte';
	import RatingSchemeGroupedView from '$features/rating-scheme/components/RatingSchemeGroupedView.svelte';
	import EvalBadge from '$features/rating-scheme/components/EvalBadge.svelte';
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
	const setWorkflowFilter = (value: string) => {
		ctx.workflowFilter = value as WorkflowStatus | 'all';
	};
	const canViewRatingScheme = $derived(ctx.canViewRatingScheme);
	const ratingSchemeWriteAffordance = $derived(ctx.ratingSchemeWriteAffordance);
	const showRatingSchemeWriteActions = $derived(ratingSchemeWriteAffordance.visible);
	const canUseRatingSchemeWriteActions = $derived(ratingSchemeWriteAffordance.allowed);
	const ratingStats = $derived(ctx.ratingStats);
	const ratingShownLabel = $derived(`${ctx.filteredRatingEntries.length} of ${ratingSchemeStore.items.length} shown`);
	const activeFilterCount = $derived(
		(ctx.evalTypeFilter !== 'all' ? 1 : 0) +
			(ctx.ratingFilter !== 'active' ? 1 : 0) +
			(ctx.hasAnyWorkflowStatus && ctx.workflowFilter !== 'all' ? 1 : 0) +
			(ctx.ratingViewMode !== 'grouped' ? 1 : 0)
	);
	const ratingMetricItems = $derived([
		{ id: 'overdue', label: 'Overdue', value: ratingStats.overdue, status: 'overdue' as RatingDueStatus },
		{ id: 'due-60', label: '60d', value: ratingStats['due-60'], status: 'due-60' as RatingDueStatus },
		{ id: 'due-30', label: '30d', value: ratingStats['due-30'], status: 'due-30' as RatingDueStatus }
	]);
	const ratingActionItems = $derived.by<WorkspaceToolbarAction[]>(() => {
		const items: WorkspaceToolbarAction[] = [
			{
				id: 'export',
				label: exportLoading ? 'Exporting...' : 'Export',
				onclick: async () => {
					exportLoading = true;
					try {
						const { exportRatingScheme } = await import('$features/rating-scheme/utils/ratingSchemeExport');
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

		if (showRatingSchemeWriteActions) {
			items.push({
				id: 'add-entry',
				label: 'Add Entry',
				onclick: () => ctx.handleAddRatingEntry(),
				disabled: !canUseRatingSchemeWriteActions,
				disabledReason: ratingSchemeWriteAffordance.explanation,
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

<div class="flex h-full min-h-0 flex-col overflow-hidden bg-background">
	{#if !canViewRatingScheme}
		<div class="p-4 md:p-6">
			<Alert.Root variant="warning">
				<Alert.Title>Access Restricted</Alert.Title>
				<Alert.Description>
					You don't have permission to view this area. Contact your organization admin for access.
				</Alert.Description>
			</Alert.Root>
		</div>
	{:else}
		<main class="flex min-h-0 flex-1 overflow-hidden p-4 md:p-6">
			<section class="flex min-h-0 w-full flex-col gap-4 overflow-hidden">
				<WorkspaceToolbar.Root ariaLabel="Evaluation controls">
					<WorkspaceToolbar.Group
						label="Evaluation filters"
						activeCount={activeFilterCount}
						data-testid="evaluation-filters"
					>
						<ButtonGroup.Root aria-label="Evaluation view mode">
							{#each ratingViewOptions as option (option.value)}
								<Button
									variant={ctx.ratingViewMode === option.value ? 'secondary' : 'outline'}
									aria-pressed={ctx.ratingViewMode === option.value}
									onclick={() => (ctx.ratingViewMode = option.value as 'grouped' | 'table')}
								>
									{option.label}
								</Button>
							{/each}
						</ButtonGroup.Root>
						<WorkspaceToolbar.Select
							ariaLabel="Evaluation type filter"
							options={evalTypeFilterOptions}
							value={ctx.evalTypeFilter}
							onValueChange={(value) => (ctx.evalTypeFilter = value as 'all' | 'OER' | 'NCOER' | 'WOER')}
						/>
						<WorkspaceToolbar.Select
							ariaLabel="Evaluation status filter"
							options={ratingFilterOptions}
							value={ctx.ratingFilter}
							onValueChange={(value) =>
								(ctx.ratingFilter = value as 'active' | 'completed' | 'change-of-rater' | 'all')}
						/>
						{#if ctx.hasAnyWorkflowStatus}
							<WorkspaceToolbar.Select
								ariaLabel="Evaluation workflow filter"
								options={workflowFilterOptions}
								value={ctx.workflowFilter}
								onValueChange={setWorkflowFilter}
							/>
						{/if}
					</WorkspaceToolbar.Group>

					<WorkspaceToolbar.Group label="Evaluation actions" zone="actions">
						<WorkspaceToolbar.Actions
							actions={ratingActionItems}
							ariaLabel="Evaluation actions"
							overflowAriaLabel="More evaluation actions"
						/>
					</WorkspaceToolbar.Group>
				</WorkspaceToolbar.Root>

				<div class="min-h-0 flex-1 overflow-auto rounded-lg border bg-card text-card-foreground">
					<div
						class="flex flex-col gap-3 border-b bg-muted/30 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
					>
						<div class="flex flex-wrap items-center gap-2" aria-label="Evaluation status summary">
							{#each ratingMetricItems as item (item.id)}
								<EvalBadge kind="due" value={item.status}>
									<span>{item.label}</span>
									<span>{item.value}</span>
								</EvalBadge>
							{/each}
						</div>
						<div class="text-xs font-medium text-muted-foreground" role="status" aria-label={ratingShownLabel}>
							{ratingShownLabel}
						</div>
					</div>
					{#if ctx.ratingViewMode === 'grouped'}
						<RatingSchemeGroupedView
							entries={ctx.filteredRatingEntries}
							personnel={personnelLookup}
							onEdit={canUseRatingSchemeWriteActions ? (entry) => ctx.handleEditRatingEntry(entry) : undefined}
						/>
					{:else}
						<RatingSchemeTableView
							entries={ctx.filteredRatingEntries}
							personnel={personnelLookup}
							onEdit={canUseRatingSchemeWriteActions ? (entry) => ctx.handleEditRatingEntry(entry) : undefined}
						/>
					{/if}
				</div>
			</section>
		</main>
	{/if}
</div>
