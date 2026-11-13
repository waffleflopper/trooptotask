<script lang="ts">
	import { tick } from 'svelte';
	import type { SchemeSort } from '../utils/ratingSchemeLineGroups';
	import type { RatingSchemeLinesContext } from '../contexts/RatingSchemeLinesContext.svelte';
	import type { RatingSchemeListingFilter } from '../contexts/RatingSchemePageContext.svelte';
	import EvalsTabs from './EvalsTabs.svelte';
	import RatingSchemeLinesGroupedView from './RatingSchemeLinesGroupedView.svelte';
	import RatingSchemeLinesTableView from './RatingSchemeLinesTableView.svelte';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { reportClientFailure } from '$lib/stores/errorReportLedger';
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

	interface Props {
		ctx: RatingSchemeLinesContext;
	}

	let { ctx }: Props = $props();

	let exportLoading = $state(false);
	let workspace = $state<HTMLElement | null>(null);
	let sheetOpener: Element | null = null;
	let sheetLineId: string | null = null;
	let sheetWasOpen = false;

	// The edited line can remount (it changes group) or disappear (it left the filter), so the opener is not enough.
	$effect.pre(() => {
		const open = ctx.sheetOpen;
		if (open && !sheetWasOpen) {
			sheetOpener = document.activeElement;
			sheetLineId = ctx.editingLineId;
		} else if (!open && sheetWasOpen) {
			void restoreFocusAfterSheet(sheetOpener, sheetLineId);
		}
		sheetWasOpen = open;
	});

	async function restoreFocusAfterSheet(opener: Element | null, lineId: string | null) {
		await tick();
		const line = lineId ? workspace?.querySelector(`[data-rating-line-id="${CSS.escape(lineId)}"]`) : null;
		const lineControl = line?.querySelector('button, tr') ?? line;
		const add = workspace?.querySelector('[data-toolbar-row] [data-toolbar-item="add-to-scheme"] button');
		const target = opener?.isConnected ? opener : (lineControl ?? add);
		if (target instanceof HTMLElement) target.focus();
	}

	const viewOptions = [
		{ value: 'grouped', label: 'Grouped' },
		{ value: 'table', label: 'Table' }
	];
	const evalTypeOptions = [
		{ value: 'all', label: 'Eval Type: All' },
		{ value: 'OER', label: 'OER' },
		{ value: 'NCOER', label: 'NCOER' },
		{ value: 'WOER', label: 'WOER' }
	];
	const listingOptions = [
		{ value: 'on-scheme', label: 'Listing: On scheme' },
		{ value: 'archived', label: 'Archived' },
		{ value: 'all', label: 'On scheme and archived' }
	];
	const sortOptions = [
		{ value: 'seniorRaterAZ', label: 'Sort: Senior rater A to Z' },
		{ value: 'urgency', label: 'Sort: Most urgent' }
	];

	const writeAffordance = $derived(ctx.writeAffordance);
	const canEdit = $derived(writeAffordance.allowed);
	const summary = $derived(ctx.summary);
	const filtered = $derived(ctx.filteredLines);
	const shownLabel = $derived(`${filtered.length} of ${ctx.lines.length} shown`);

	async function exportLines(): Promise<void> {
		exportLoading = true;
		const current = stillInOrganizationLifetime();
		const selection = filtered;
		const personnel = ctx.personnelLookup;
		try {
			const { exportRatingSchemeLines } = await import('../utils/ratingSchemeLinesExport');
			await exportRatingSchemeLines(selection, personnel);
		} catch (err) {
			if (current()) {
				reportClientFailure(err);
				toastStore.error(err instanceof Error ? err.message : 'Export failed');
			}
		} finally {
			exportLoading = false;
		}
	}

	const toolbarItems = $derived.by<ToolbarItem[]>(() => {
		const items: ToolbarItem[] = [
			{
				kind: 'view',
				id: 'view-mode',
				label: 'Rating scheme view mode',
				options: viewOptions,
				value: ctx.view.viewMode,
				onValueChange: (value) => (ctx.view.viewMode = value as 'grouped' | 'table')
			},
			{
				kind: 'select',
				id: 'eval-type',
				label: 'Evaluation type',
				ariaLabel: 'Eval type filter',
				options: evalTypeOptions,
				value: ctx.view.evalTypeFilter,
				defaultValue: 'all',
				onValueChange: (value) => (ctx.view.evalTypeFilter = value as typeof ctx.view.evalTypeFilter)
			},
			{
				kind: 'select',
				id: 'listing',
				label: 'Rating scheme listing',
				ariaLabel: 'Listing filter',
				options: listingOptions,
				value: ctx.view.listing,
				defaultValue: 'on-scheme',
				onValueChange: (value) => (ctx.view.listing = value as RatingSchemeListingFilter)
			}
		];
		if (ctx.view.viewMode === 'grouped') {
			items.push({
				kind: 'select',
				id: 'sort',
				label: 'Group order',
				ariaLabel: 'Group order',
				options: sortOptions,
				value: ctx.view.sort,
				defaultValue: 'seniorRaterAZ',
				onValueChange: (value) => (ctx.view.sort = value as SchemeSort)
			});
		}
		items.push({
			kind: 'action',
			id: 'export',
			label: exportLoading ? 'Exporting...' : 'Export',
			icon: 'download',
			onclick: exportLines,
			loading: exportLoading
		});
		return items;
	});

	const toolbarSearch = $derived({
		label: 'Search by Soldier or rater',
		placeholder: 'Search Soldier or rater...',
		value: ctx.view.searchQuery,
		onValueChange: (value) => (ctx.view.searchQuery = value)
	} satisfies NonNullable<WorkspaceToolbarProps['search']>);

	const toolbarPrimary = $derived.by<WorkspaceToolbarProps['primary']>(() =>
		writeAffordance.visible
			? {
					kind: 'action',
					id: 'add-to-scheme',
					label: 'Add to scheme',
					icon: 'plus',
					onclick: () => ctx.openNewLine(),
					disabled: !canEdit,
					disabledReason: canEdit ? undefined : writeAffordance.explanation
				}
			: undefined
	);

	const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
</script>

<svelte:head>
	<title>Evals - Troop to Task</title>
</svelte:head>

{#snippet headerCounts()}
	<span class="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[15px]">
		<span>{summary.onScheme} on the scheme</span>
		<span class="h-3.5 w-px bg-border max-sm:hidden" aria-hidden="true"></span>
		<span>{plural(summary.seniorRaters, 'senior rater', 'senior raters')}</span>
		<span class="h-3.5 w-px bg-border max-sm:hidden" aria-hidden="true"></span>
		<span>{plural(summary.raters, 'rater', 'raters')}</span>
		<span class="h-3.5 w-px bg-border max-sm:hidden" aria-hidden="true"></span>
		<span class="text-muted-foreground">{summary.inProgress} with an eval in progress</span>
	</span>
{/snippet}

{#snippet shownCount()}
	<span class="text-xs font-medium text-muted-foreground" role="status" aria-label={shownLabel}>{shownLabel}</span>
{/snippet}

<div class="flex h-full min-h-0 flex-col overflow-hidden bg-background" bind:this={workspace}>
	{#if !ctx.canViewRatingScheme}
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
			<EvalsTabs orgId={ctx.orgId} section="rating-scheme" pastThru={ctx.pastThru} />

			<WorkspaceToolbar
				ariaLabel="Rating scheme controls"
				items={toolbarItems}
				search={toolbarSearch}
				primary={toolbarPrimary}
				compactBelow="sm"
			/>

			<div class="min-h-0 flex-1 overflow-auto">
				{#if ctx.lines.length === 0}
					<Empty.Root class="border-border bg-card">
						<Empty.Header>
							<Empty.Title>Nothing on the rating scheme yet</Empty.Title>
							<Empty.Description>
								{canEdit ? 'Add a Soldier to list their rating chain.' : 'No rating chains are listed yet.'}
							</Empty.Description>
						</Empty.Header>
						{#if canEdit}
							<Empty.Content>
								<Button onclick={() => ctx.openNewLine()}>Add to scheme</Button>
							</Empty.Content>
						{/if}
					</Empty.Root>
				{:else if filtered.length === 0}
					<Empty.Root class="border-border bg-card">
						<Empty.Header>
							{#if ctx.hasActiveSearchOrFilters}
								<Empty.Title>No lines match</Empty.Title>
								<Empty.Description>Nothing fits the current search and filters.</Empty.Description>
							{:else}
								<Empty.Title>Nothing on the rating scheme</Empty.Title>
								<Empty.Description>Choose Archived to see lines taken off the scheme.</Empty.Description>
							{/if}
						</Empty.Header>
						{#if ctx.hasActiveSearchOrFilters}
							<Empty.Content>
								<Button variant="outline" onclick={() => ctx.clearSearchAndFilters()}>Clear search and filters</Button>
							</Empty.Content>
						{/if}
					</Empty.Root>
				{:else if ctx.view.viewMode === 'grouped'}
					<RatingSchemeLinesGroupedView
						orgId={ctx.orgId}
						lines={filtered}
						personnel={ctx.personnelLookup}
						sort={ctx.view.sort}
						onEdit={canEdit ? (line) => ctx.openLine(line) : undefined}
					/>
				{:else}
					<RatingSchemeLinesTableView
						orgId={ctx.orgId}
						lines={filtered}
						personnel={ctx.personnelLookup}
						onEdit={canEdit ? (line) => ctx.openLine(line) : undefined}
					/>
				{/if}
			</div>
		</div>
	{/if}
</div>
