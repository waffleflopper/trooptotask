<script lang="ts">
	import { tick } from 'svelte';
	import type { PersonnelLookup } from '$features/personnel/contracts';
	import {
		WORKFLOW_STATUS_OPTIONS,
		type RatingDueStatus,
		type WorkflowStatus
	} from '$features/rating-scheme/rating-scheme.types';
	import { ratingSchemeStore } from '$features/rating-scheme/stores/ratingScheme.svelte';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { stillInOrganizationLifetime } from '$lib/stores/core';
	import * as Alert from '$lib/components/ui/alert';
	import {
		WorkspaceToolbar,
		type ToolbarItem,
		type WorkspaceToolbarProps
	} from '$lib/components/patterns/workspace-toolbar';
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
	let workspace = $state<HTMLElement | null>(null);
	let entryDialogOpener: Element | null = null;
	let entryDialogEntryId: string | null = null;
	let entryDialogWasOpen = false;

	// The edited row can remount (it changes group) or disappear (it left the filter), so the opener is not enough.
	$effect.pre(() => {
		const open = ctx.ratingModalOpen;
		if (open && !entryDialogWasOpen) {
			entryDialogOpener = document.activeElement;
			entryDialogEntryId = ctx.editingRatingEntryId;
		} else if (!open && entryDialogWasOpen) {
			void restoreFocusAfterEntryDialog(entryDialogOpener, entryDialogEntryId);
		}
		entryDialogWasOpen = open;
	});

	async function restoreFocusAfterEntryDialog(opener: Element | null, entryId: string | null) {
		await tick();
		const row = entryId ? workspace?.querySelector(`[data-rating-entry-id="${CSS.escape(entryId)}"]`) : null;
		const addEntry = workspace?.querySelector('[data-toolbar-row] [data-toolbar-item="add-entry"] button');
		const target = opener?.isConnected ? opener : (row ?? addEntry);
		if (target instanceof HTMLElement) target.focus();
	}
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
	const ratingMetricItems = $derived([
		{ id: 'overdue', label: 'Overdue', value: ratingStats.overdue, status: 'overdue' as RatingDueStatus },
		{ id: 'due-60', label: '60d', value: ratingStats['due-60'], status: 'due-60' as RatingDueStatus },
		{ id: 'due-30', label: '30d', value: ratingStats['due-30'], status: 'due-30' as RatingDueStatus }
	]);
	async function exportEntries(): Promise<void> {
		exportLoading = true;
		const current = stillInOrganizationLifetime();
		try {
			const { exportRatingScheme } = await import('$features/rating-scheme/utils/ratingSchemeExport');
			await exportRatingScheme(ctx.filteredRatingEntries, personnelLookup);
		} catch (err) {
			if (current()) toastStore.error(err instanceof Error ? err.message : 'Export failed');
		} finally {
			exportLoading = false;
		}
	}

	const toolbarItems = $derived.by<ToolbarItem[]>(() => {
		const items: ToolbarItem[] = [
			{
				kind: 'view',
				id: 'view-mode',
				label: 'Evaluation view mode',
				options: ratingViewOptions,
				value: ctx.ratingViewMode,
				onValueChange: (value) => (ctx.ratingViewMode = value as 'grouped' | 'table')
			},
			{
				kind: 'select',
				id: 'eval-type',
				label: 'Evaluation type',
				ariaLabel: 'Evaluation type filter',
				options: evalTypeFilterOptions,
				value: ctx.evalTypeFilter,
				defaultValue: 'all',
				onValueChange: (value) => (ctx.evalTypeFilter = value as 'all' | 'OER' | 'NCOER' | 'WOER')
			},
			{
				kind: 'select',
				id: 'status',
				label: 'Evaluation status',
				ariaLabel: 'Evaluation status filter',
				options: ratingFilterOptions,
				value: ctx.ratingFilter,
				defaultValue: 'active',
				onValueChange: (value) => (ctx.ratingFilter = value as 'active' | 'completed' | 'change-of-rater' | 'all')
			}
		];

		if (ctx.hasAnyWorkflowStatus) {
			items.push({
				kind: 'select',
				id: 'workflow',
				label: 'Evaluation workflow',
				ariaLabel: 'Evaluation workflow filter',
				options: workflowFilterOptions,
				value: ctx.workflowFilter,
				defaultValue: 'all',
				onValueChange: setWorkflowFilter
			});
		}

		items.push({
			kind: 'action',
			id: 'export',
			label: exportLoading ? 'Exporting...' : 'Export',
			icon: 'download',
			onclick: exportEntries,
			loading: exportLoading
		});

		return items;
	});

	const toolbarPrimary = $derived.by<WorkspaceToolbarProps['primary']>(() =>
		showRatingSchemeWriteActions
			? {
					kind: 'action',
					id: 'add-entry',
					label: 'Add Entry',
					onclick: () => ctx.handleAddRatingEntry(),
					disabled: !canUseRatingSchemeWriteActions,
					disabledReason: canUseRatingSchemeWriteActions ? undefined : ratingSchemeWriteAffordance.explanation
				}
			: undefined
	);
</script>

<svelte:head>
	<title>Evals - Troop to Task</title>
</svelte:head>

<div class="flex h-full min-h-0 flex-col overflow-hidden bg-background" bind:this={workspace}>
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
		<div class="flex min-h-0 flex-1 overflow-hidden p-4 md:p-6">
			<section class="flex min-h-0 w-full flex-col gap-4 overflow-hidden">
				<WorkspaceToolbar ariaLabel="Evaluation controls" items={toolbarItems} primary={toolbarPrimary} />

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
		</div>
	{/if}
</div>
