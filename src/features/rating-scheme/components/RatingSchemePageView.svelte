<script lang="ts">
	import { tick } from 'svelte';
	import { page } from '$app/state';
	import { replaceState } from '$app/navigation';
	import type { PersonnelLookup } from '$features/personnel/contracts';
	import { WORKFLOW_STATUS_OPTIONS, type WorkflowStatus } from '$features/rating-scheme/rating-scheme.types';
	import { ratingSchemeStore } from '$features/rating-scheme/stores/ratingScheme.svelte';
	import { ratingDueTone } from '$features/rating-scheme/utils/ratingDueTone';
	import type { GroupedSort } from '$features/rating-scheme/utils/ratingSchemeGroups';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { stillInOrganizationLifetime } from '$lib/stores/core';
	import * as Alert from '$lib/components/ui/alert';
	import { Button } from '$lib/components/ui/button';
	import * as Empty from '$lib/components/ui/empty';
	import * as PageShell from '$lib/components/patterns/page-shell';
	import {
		WorkspaceToolbar,
		type ToolbarItem,
		type WorkspaceToolbarProps
	} from '$lib/components/patterns/workspace-toolbar';
	import RatingSchemeTableView from '$features/rating-scheme/components/RatingSchemeTableView.svelte';
	import RatingSchemeGroupedView from '$features/rating-scheme/components/RatingSchemeGroupedView.svelte';
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
	// `?entry=<id>` opens that entry once, as a link from the person page; the param is then dropped so closing stays closed.
	$effect(() => {
		const id = page.url.searchParams.get('entry');
		if (!id) return;
		const entry = ratingSchemeStore.items.find((item) => item.id === id);
		if (!entry) return;
		const url = new URL(page.url);
		url.searchParams.delete('entry');
		replaceState(url, page.state);
		if (canUseRatingSchemeWriteActions) ctx.handleEditRatingEntry(entry);
	});
	const ratingStats = $derived(ctx.ratingStats);
	const ratingShownLabel = $derived(`${ctx.filteredRatingEntries.length} of ${ctx.totalEntryCount} shown`);
	const groupedSortOptions = [
		{ value: 'urgency', label: 'Sort: Most urgent' },
		{ value: 'seniorRaterAZ', label: 'Sort: Senior rater A to Z' }
	];
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

		if (ctx.ratingViewMode === 'grouped') {
			items.push({
				kind: 'select',
				id: 'grouped-sort',
				label: 'Group order',
				ariaLabel: 'Group order',
				options: groupedSortOptions,
				value: ctx.groupedSort,
				defaultValue: 'urgency',
				onValueChange: (value) => (ctx.groupedSort = value as GroupedSort)
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

	const toolbarSearch = $derived({
		label: 'Search by Soldier or rater',
		placeholder: 'Search Soldier or rater...',
		value: ctx.searchQuery,
		onValueChange: (value) => (ctx.searchQuery = value)
	} satisfies NonNullable<WorkspaceToolbarProps['search']>);

	const toolbarPrimary = $derived.by<WorkspaceToolbarProps['primary']>(() =>
		showRatingSchemeWriteActions
			? {
					kind: 'action',
					id: 'add-entry',
					label: 'Add Entry',
					icon: 'plus',
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

{#snippet headerCounts()}
	<span class="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[15px]">
		<span><span class="tabular-nums">{ctx.activeEntryCount}</span> active</span>
		<span class="h-3.5 w-px bg-border max-sm:hidden" aria-hidden="true"></span>
		<span class="font-semibold {ratingDueTone.overdue.text}">
			<span class="tabular-nums">{ratingStats.overdue}</span> past thru
		</span>
		<span class="h-3.5 w-px bg-border max-sm:hidden" aria-hidden="true"></span>
		<span class="font-semibold {ratingDueTone['due-30'].text}">
			<span class="tabular-nums">{ratingStats['due-30']}</span> thru in 30 days
		</span>
		<span class="h-3.5 w-px bg-border max-sm:hidden" aria-hidden="true"></span>
		<span class="font-semibold {ratingDueTone['due-60'].text}">
			<span class="tabular-nums">{ratingStats['due-60']}</span> thru in 31 to 60 days
		</span>
	</span>
{/snippet}

{#snippet shownCount()}
	<span class="text-xs font-medium text-muted-foreground" role="status" aria-label={ratingShownLabel}>
		{ratingShownLabel}
	</span>
{/snippet}

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
		<div class="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-hidden px-6 pt-4 pb-5 max-sm:p-3">
			<PageShell.Header
				variant="display"
				eyebrow="Rating scheme · {ctx.orgName}"
				title="Evals"
				subtitle={headerCounts}
				aside={shownCount}
			/>

			<WorkspaceToolbar
				ariaLabel="Evaluation controls"
				items={toolbarItems}
				search={toolbarSearch}
				primary={toolbarPrimary}
				compactBelow="sm"
			/>

			<div class="min-h-0 flex-1 overflow-auto">
				{#if ctx.filteredRatingEntries.length === 0 && ctx.totalEntryCount > 0}
					<Empty.Root class="border-border bg-card">
						<Empty.Header>
							<Empty.Title>No entries match</Empty.Title>
							<Empty.Description>Nothing fits the current search and filters.</Empty.Description>
						</Empty.Header>
						<Empty.Content>
							<Button variant="outline" onclick={() => ctx.clearSearchAndFilters()}>Clear search and filters</Button>
						</Empty.Content>
					</Empty.Root>
				{:else if ctx.ratingViewMode === 'grouped'}
					<RatingSchemeGroupedView
						entries={ctx.filteredRatingEntries}
						personnel={personnelLookup}
						sort={ctx.groupedSort}
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
		</div>
	{/if}
</div>
