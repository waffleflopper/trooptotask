<script lang="ts">
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import ArchiveIcon from '@lucide/svelte/icons/archive';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import RotateCcwIcon from '@lucide/svelte/icons/rotate-ccw';
	import SaveIcon from '@lucide/svelte/icons/save';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
	import * as DataTable from '$lib/components/ui/data-table/index.js';
	import type { ColumnDef, DataTableState } from '$lib/components/ui/data-table/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import * as NativeSelect from '$lib/components/ui/native-select/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import * as WorkspaceToolbar from '$lib/components/ui/workspace-toolbar/index.js';
	import type { RanksSettingsData } from './settingsRanks.server';
	import type { SettingsRankCatalogRow, SettingsRankServicePackOption } from './settingsSectionTypes';

	type RankServiceFilter = SettingsRankCatalogRow['service'] | 'all';
	type BulkRankTargetState = 'active' | 'retired';
	type PendingBulkRankState = {
		pack: SettingsRankServicePackOption;
		targetState: BulkRankTargetState;
		form: HTMLFormElement;
	};

	let {
		ranksSettings,
		form
	}: {
		ranksSettings: RanksSettingsData;
		form: { [key: string]: unknown; rankError?: string } | null;
	} = $props();

	let savingAction = $state<string | null>(null);
	let activeServiceFilter = $state<RankServiceFilter>('all');
	let retiredServiceFilter = $state<RankServiceFilter>('all');
	let expandedRankCode = $state<string | null>(null);
	let customRankOpen = $state(false);
	let pendingBulkRankState = $state<PendingBulkRankState | null>(null);
	let confirmedBulkRankForm = $state<HTMLFormElement | null>(null);

	const ranks = $derived(ranksSettings.sections.ranks);
	const rankError = $derived(typeof form?.rankError === 'string' ? form.rankError : null);
	const branchFilterOptions = $derived([{ value: 'all' as const, label: 'All branches' }, ...ranks.options.services]);
	const activeRankRows = $derived(filterRowsByService(ranks.entries.active, activeServiceFilter));
	const retiredRankRows = $derived(filterRowsByService(ranks.entries.retired, retiredServiceFilter));

	const payGradeOrder = new Map(
		[
			'O-10',
			'O-9',
			'O-8',
			'O-7',
			'O-6',
			'O-5',
			'O-4',
			'O-3',
			'O-2',
			'O-1',
			'W-5',
			'W-4',
			'W-3',
			'W-2',
			'W-1',
			'E-9',
			'E-8',
			'E-7',
			'E-6',
			'E-5',
			'E-4',
			'E-3',
			'E-2',
			'E-1',
			'ungraded'
		].map((payGrade, index) => [payGrade, index])
	);

	const rankColumns: ColumnDef<SettingsRankCatalogRow>[] = [
		{
			key: 'rank',
			header: 'Rank',
			value: (entry) => `${entry.code} ${entry.label}`,
			searchValue: (entry) => `${entry.code} ${entry.label}`,
			compare: compareRankPrecedence,
			width: '20rem'
		},
		{
			key: 'branch',
			header: 'Branch',
			value: (entry) => entry.serviceLabel,
			searchValue: (entry) => entry.serviceLabel,
			compare: (a, b) => a.serviceLabel.localeCompare(b.serviceLabel) || compareRankPrecedence(a, b),
			width: '10rem'
		},
		{
			key: 'grade',
			header: 'Pay grade',
			value: (entry) => entry.payGradeLabel,
			compare: compareRankPrecedence,
			width: '8rem'
		},
		{
			key: 'source',
			header: 'Source',
			value: (entry) => entry.sourceLabel,
			searchValue: (entry) => entry.sourceLabel,
			width: '8rem'
		},
		{
			key: 'references',
			header: 'Refs',
			value: totalReferences,
			compare: (a, b) => totalReferences(a) - totalReferences(b),
			align: 'right',
			width: '5rem'
		},
		{
			key: 'actions',
			header: 'Actions',
			value: () => '',
			searchable: false,
			sortable: false,
			align: 'right',
			width: '14rem'
		}
	];

	function enhancedForm(key: string): SubmitFunction {
		return () => {
			savingAction = key;
			return async ({ update }) => {
				try {
					await update();
				} finally {
					savingAction = null;
				}
			};
		};
	}

	function filterRowsByService(
		rows: SettingsRankCatalogRow[],
		serviceFilter: RankServiceFilter
	): SettingsRankCatalogRow[] {
		if (serviceFilter === 'all') return rows;
		return rows.filter((entry) => entry.service === serviceFilter);
	}

	function sourceVariant(source: SettingsRankCatalogRow['source']): 'secondary' | 'outline' {
		return source === 'built-in' ? 'secondary' : 'outline';
	}

	function rankDomId(code: string): string {
		const safeCode = Array.from(code, (char) => char.codePointAt(0)?.toString(36) ?? '0').join('-');
		return `rank-${safeCode || 'entry'}`;
	}

	function rankDetailId(code: string): string {
		return `${rankDomId(code)}-detail`;
	}

	function totalReferences(entry: SettingsRankCatalogRow): number {
		return entry.referenceSummary.activeReferences.total + entry.referenceSummary.historicalReferences.total;
	}

	function payGradeIndex(entry: SettingsRankCatalogRow): number {
		return payGradeOrder.get(entry.payGrade) ?? Number.MAX_SAFE_INTEGER;
	}

	function compareRankPrecedence(a: SettingsRankCatalogRow, b: SettingsRankCatalogRow): number {
		return (
			payGradeIndex(a) - payGradeIndex(b) ||
			a.sortOrder - b.sortOrder ||
			a.code.localeCompare(b.code) ||
			a.label.localeCompare(b.label)
		);
	}

	function isRankExpanded(entry: SettingsRankCatalogRow): boolean {
		return expandedRankCode === entry.code;
	}

	function toggleExpandedRank(entry: SettingsRankCatalogRow): void {
		expandedRankCode = expandedRankCode === entry.code ? null : entry.code;
	}

	function branchFilterLabel(filter: RankServiceFilter): string {
		if (filter === 'all') return 'All branches';
		return ranks.options.services.find((option) => option.value === filter)?.label ?? filter;
	}

	function handleBulkRankStateSubmit(
		event: SubmitEvent,
		pack: SettingsRankServicePackOption,
		targetState: BulkRankTargetState
	): void {
		const form = event.currentTarget;
		if (!(form instanceof HTMLFormElement)) return;
		if (confirmedBulkRankForm === form) {
			confirmedBulkRankForm = null;
			return;
		}

		event.preventDefault();
		if (bulkRankStateCount(pack, targetState) <= 0) return;
		pendingBulkRankState = { pack, targetState, form };
	}

	function submitPendingBulkRankState(): void {
		if (!pendingBulkRankState) return;
		const form = pendingBulkRankState.form;
		confirmedBulkRankForm = form;
		pendingBulkRankState = null;
		form.requestSubmit();
	}

	function bulkRankStateCount(pack: SettingsRankServicePackOption, targetState: BulkRankTargetState): number {
		return targetState === 'retired' ? pack.activeCount : pack.retiredCount;
	}

	function bulkRankStateTitle(pending: PendingBulkRankState): string {
		return pending.targetState === 'retired'
			? `Retire ${pending.pack.label} ranks`
			: `Reactivate ${pending.pack.label} ranks`;
	}

	function bulkRankStateMessage(pending: PendingBulkRankState): string {
		const count = bulkRankStateCount(pending.pack, pending.targetState);
		if (pending.targetState === 'retired') {
			return `${count} ${pending.pack.label} built-in ranks will be hidden from future rank selection. Existing Personnel records and historical references stay intact.`;
		}
		return `${count} ${pending.pack.label} built-in ranks will become available for future rank selection again. Existing records stay intact.`;
	}

	function bulkRankStateConfirmLabel(pending: PendingBulkRankState): string {
		return pending.targetState === 'retired' ? 'Retire active ranks' : 'Reactivate retired ranks';
	}
</script>

<div class="grid max-w-7xl gap-4">
	<section class="grid gap-4 rounded-lg border bg-card p-4 text-card-foreground" aria-labelledby="rank-catalog-heading">
		<div class="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
			<div class="grid gap-1">
				<h2 id="rank-catalog-heading" class="font-heading text-lg font-semibold tracking-tight">Rank Catalog</h2>
				<p class="text-sm text-muted-foreground">
					Manage the Organization vocabulary used for future rank selection, imports, and ordering.
				</p>
			</div>
			<Badge variant={ranks.commands.canManageCatalog ? 'secondary' : 'outline'}>
				{ranks.commands.canManageCatalog ? 'Catalog manager' : 'View only'}
			</Badge>
		</div>

		{#if rankError}
			<Alert.Root variant="destructive">
				<Alert.Description>{rankError}</Alert.Description>
			</Alert.Root>
		{/if}

		{#if !ranks.commands.canManageCatalog}
			<Alert.Root>
				<Alert.Description>
					Organization admin or owner access is required to change service packs, custom ranks, or retirement state.
				</Alert.Description>
			</Alert.Root>
		{/if}

		<div class="grid gap-2 text-sm text-muted-foreground md:grid-cols-2">
			<p>{ranks.copy.payGradeHelp}</p>
			<p>{ranks.copy.tieBreakHelp}</p>
		</div>
	</section>

	<section class="grid gap-4 rounded-lg border bg-card p-4 text-card-foreground" aria-labelledby="rank-service-packs">
		<div class="grid gap-1">
			<h2 id="rank-service-packs" class="font-heading text-lg font-semibold tracking-tight">Branch Coverage</h2>
			<p class="text-sm text-muted-foreground">
				Add missing built-in ranks by branch, or retire and reactivate a branch pack in one action.
			</p>
		</div>
		<Separator />
		<div class="overflow-hidden rounded-lg border">
			{#each ranks.servicePacks as pack (pack.value)}
				<div class="grid gap-3 border-b p-3 last:border-b-0 lg:grid-cols-[minmax(14rem,1fr)_auto] lg:items-center">
					<div class="grid gap-2">
						<div class="flex flex-wrap items-center gap-2">
							<h3 class="font-medium">{pack.label}</h3>
							<Badge variant={pack.isInstalled ? 'secondary' : 'outline'}>
								{pack.existingCount} of {pack.builtInCount}
							</Badge>
						</div>
						<div class="flex flex-wrap gap-2 text-xs text-muted-foreground">
							<span>{pack.activeCount} active</span>
							<span>{pack.retiredCount} retired</span>
							<span>{pack.missingCount} missing</span>
						</div>
					</div>
					<div class="flex flex-wrap gap-2 lg:justify-end">
						<form method="POST" action="?/addServicePack" use:enhance={enhancedForm(`pack-${pack.value}`)}>
							<input type="hidden" name="service" value={pack.value} />
							<Button
								type="submit"
								size="sm"
								disabled={!ranks.commands.canAddServicePack ||
									pack.isInstalled ||
									savingAction === `pack-${pack.value}`}
								aria-busy={savingAction === `pack-${pack.value}`}
								aria-label={`Add ${pack.label}`}
							>
								<PlusIcon aria-hidden />
								{pack.isInstalled ? 'Added' : `Add ${pack.label}`}
							</Button>
						</form>
						<form
							method="POST"
							action="?/bulkRankState"
							onsubmit={(event) => handleBulkRankStateSubmit(event, pack, 'retired')}
							use:enhance={enhancedForm(`bulk-retire-${pack.value}`)}
						>
							<input type="hidden" name="service" value={pack.value} />
							<input type="hidden" name="targetState" value="retired" />
							<Button
								type="submit"
								variant="outline"
								size="sm"
								disabled={!pack.canBulkRetire || savingAction === `bulk-retire-${pack.value}`}
								aria-busy={savingAction === `bulk-retire-${pack.value}`}
								aria-label={`Retire active ${pack.label} ranks`}
							>
								<ArchiveIcon aria-hidden />
								Retire active
							</Button>
						</form>
						<form
							method="POST"
							action="?/bulkRankState"
							onsubmit={(event) => handleBulkRankStateSubmit(event, pack, 'active')}
							use:enhance={enhancedForm(`bulk-reactivate-${pack.value}`)}
						>
							<input type="hidden" name="service" value={pack.value} />
							<input type="hidden" name="targetState" value="active" />
							<Button
								type="submit"
								variant="outline"
								size="sm"
								disabled={!pack.canBulkReactivate || savingAction === `bulk-reactivate-${pack.value}`}
								aria-busy={savingAction === `bulk-reactivate-${pack.value}`}
								aria-label={`Reactivate retired ${pack.label} ranks`}
							>
								<RotateCcwIcon aria-hidden />
								Reactivate retired
							</Button>
						</form>
					</div>
				</div>
			{/each}
		</div>
	</section>

	<div>
		<Button
			type="button"
			variant="link"
			size="sm"
			disabled={!ranks.commands.canAddCustomRank}
			aria-expanded={customRankOpen}
			aria-controls="add-custom-rank-panel"
			onclick={() => (customRankOpen = !customRankOpen)}
		>
			<PlusIcon aria-hidden />
			{customRankOpen ? 'Hide custom rank form' : 'Add custom rank'}
		</Button>
	</div>

	{#if customRankOpen}
		<section
			id="add-custom-rank-panel"
			class="grid gap-4 rounded-lg border bg-card p-4 text-card-foreground"
			aria-labelledby="add-custom-rank"
		>
			<div class="grid gap-1">
				<h2 id="add-custom-rank" class="font-heading text-lg font-semibold tracking-tight">Add Custom Rank</h2>
				<p class="text-sm text-muted-foreground">
					Custom entries are available for future selection and can be retired or removed when unused.
				</p>
			</div>
			<Separator />
			<form method="POST" action="?/saveRank" class="grid gap-4" use:enhance={enhancedForm('rank-add')}>
				<input type="hidden" name="intent" value="add" />
				<div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
					<div class="grid gap-2">
						<Label for="rank-code">Code</Label>
						<Input
							id="rank-code"
							name="code"
							maxlength={80}
							placeholder="DET-SGT"
							required
							disabled={!ranks.commands.canAddCustomRank}
						/>
					</div>
					<div class="grid gap-2">
						<Label for="rank-label">Label</Label>
						<Input
							id="rank-label"
							name="label"
							maxlength={120}
							placeholder="Detachment Sergeant"
							required
							disabled={!ranks.commands.canAddCustomRank}
						/>
					</div>
					<div class="grid gap-2">
						<Label for="rank-service">Service</Label>
						<NativeSelect.Root
							id="rank-service"
							name="service"
							value="custom"
							disabled={!ranks.commands.canAddCustomRank}
						>
							{#each ranks.options.services as option (option.value)}
								<NativeSelect.Option value={option.value}>{option.label}</NativeSelect.Option>
							{/each}
						</NativeSelect.Root>
					</div>
					<div class="grid gap-2">
						<Label for="rank-category">Category</Label>
						<NativeSelect.Root
							id="rank-category"
							name="category"
							value="custom"
							disabled={!ranks.commands.canAddCustomRank}
						>
							{#each ranks.options.categories as option (option.value)}
								<NativeSelect.Option value={option.value}>{option.label}</NativeSelect.Option>
							{/each}
						</NativeSelect.Root>
					</div>
					<div class="grid gap-2">
						<Label for="rank-pay-grade">Pay grade</Label>
						<NativeSelect.Root
							id="rank-pay-grade"
							name="payGrade"
							value="ungraded"
							disabled={!ranks.commands.canAddCustomRank}
						>
							{#each ranks.options.payGrades as option (option.value)}
								<NativeSelect.Option value={option.value}>{option.label}</NativeSelect.Option>
							{/each}
						</NativeSelect.Root>
					</div>
					<div class="grid gap-2">
						<Label for="rank-state">State</Label>
						<NativeSelect.Root id="rank-state" name="state" value="active" disabled={!ranks.commands.canAddCustomRank}>
							{#each ranks.options.states as option (option.value)}
								<NativeSelect.Option value={option.value}>{option.label}</NativeSelect.Option>
							{/each}
						</NativeSelect.Root>
					</div>
					<div class="grid gap-1.5">
						<Label for="rank-sort-order">Tie-break order</Label>
						<p id="rank-sort-order-help" class="text-xs text-muted-foreground">
							Only used when ranks share the same pay grade; lower numbers sort earlier.
						</p>
						<Input
							id="rank-sort-order"
							name="sortOrder"
							type="number"
							value="500"
							aria-describedby="rank-sort-order-help"
							disabled={!ranks.commands.canAddCustomRank}
						/>
					</div>
				</div>
				<div>
					<Button
						type="submit"
						disabled={!ranks.commands.canAddCustomRank || savingAction === 'rank-add'}
						aria-busy={savingAction === 'rank-add'}
					>
						<PlusIcon aria-hidden />
						Add Rank
					</Button>
				</div>
			</form>
		</section>
	{/if}

	<section class="grid gap-4 rounded-lg border bg-card p-4 text-card-foreground" aria-labelledby="active-ranks-heading">
		<div class="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
			<div class="grid gap-1">
				<h2 id="active-ranks-heading" class="font-heading text-lg font-semibold tracking-tight">Active Ranks</h2>
				<p class="text-sm text-muted-foreground">Available for future selection and import matching.</p>
			</div>
			<Badge variant="outline">{ranks.entries.active.length} active</Badge>
		</div>
		<DataTable.DataTable
			data={activeRankRows}
			columns={rankColumns}
			ariaLabel="Active organization ranks"
			emptyMessage={`No active ranks match ${branchFilterLabel(activeServiceFilter)}.`}
			density="dense"
			pageSize={25}
			initialSortKey="rank"
			rowKey={(entry) => entry.code}
			onRowClick={toggleExpandedRank}
			rowActionLabel={(entry) => `${isRankExpanded(entry) ? 'Hide' : 'Show'} details for ${entry.code}`}
			cell={rankCell}
			rowDetail={rankDetail}
			rowDetailVisible={isRankExpanded}
			toolbar={activeRankToolbar}
		/>
	</section>

	<section
		class="grid gap-4 rounded-lg border bg-card p-4 text-card-foreground"
		aria-labelledby="retired-ranks-heading"
	>
		<div class="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
			<div class="grid gap-1">
				<h2 id="retired-ranks-heading" class="font-heading text-lg font-semibold tracking-tight">Retired Ranks</h2>
				<p class="text-sm text-muted-foreground">Hidden from future selection while preserving existing references.</p>
			</div>
			<Badge variant="outline">{ranks.entries.retired.length} retired</Badge>
		</div>
		<DataTable.DataTable
			data={retiredRankRows}
			columns={rankColumns}
			ariaLabel="Retired organization ranks"
			emptyMessage={`No retired ranks match ${branchFilterLabel(retiredServiceFilter)}.`}
			density="dense"
			pageSize={25}
			initialSortKey="rank"
			rowKey={(entry) => entry.code}
			onRowClick={toggleExpandedRank}
			rowActionLabel={(entry) => `${isRankExpanded(entry) ? 'Hide' : 'Show'} details for ${entry.code}`}
			cell={rankCell}
			rowDetail={rankDetail}
			rowDetailVisible={isRankExpanded}
			toolbar={retiredRankToolbar}
		/>
	</section>
</div>

{#if pendingBulkRankState}
	<ConfirmDialog
		title={bulkRankStateTitle(pendingBulkRankState)}
		message={bulkRankStateMessage(pendingBulkRankState)}
		confirmLabel={bulkRankStateConfirmLabel(pendingBulkRankState)}
		variant="warning"
		onConfirm={submitPendingBulkRankState}
		onCancel={() => (pendingBulkRankState = null)}
	/>
{/if}

{#snippet activeRankToolbar(table: DataTableState<SettingsRankCatalogRow>)}
	<WorkspaceToolbar.Root ariaLabel="Active rank table controls">
		<WorkspaceToolbar.Group label="Search active ranks">
			<DataTable.Search {table} ariaLabel="Search active ranks" placeholder="Search active ranks" />
		</WorkspaceToolbar.Group>
		<WorkspaceToolbar.Group label="Filter active ranks by branch">
			<NativeSelect.Root
				id="active-rank-branch-filter"
				size="sm"
				bind:value={activeServiceFilter}
				aria-label="Filter active ranks by branch"
			>
				{#each branchFilterOptions as option (option.value)}
					<NativeSelect.Option value={option.value}>{option.label}</NativeSelect.Option>
				{/each}
			</NativeSelect.Root>
		</WorkspaceToolbar.Group>
		<WorkspaceToolbar.Group label="Active rank count" zone="meta">
			<WorkspaceToolbar.Meta>{table.totalRows} shown</WorkspaceToolbar.Meta>
		</WorkspaceToolbar.Group>
	</WorkspaceToolbar.Root>
{/snippet}

{#snippet retiredRankToolbar(table: DataTableState<SettingsRankCatalogRow>)}
	<WorkspaceToolbar.Root ariaLabel="Retired rank table controls">
		<WorkspaceToolbar.Group label="Search retired ranks">
			<DataTable.Search {table} ariaLabel="Search retired ranks" placeholder="Search retired ranks" />
		</WorkspaceToolbar.Group>
		<WorkspaceToolbar.Group label="Filter retired ranks by branch">
			<NativeSelect.Root
				id="retired-rank-branch-filter"
				size="sm"
				bind:value={retiredServiceFilter}
				aria-label="Filter retired ranks by branch"
			>
				{#each branchFilterOptions as option (option.value)}
					<NativeSelect.Option value={option.value}>{option.label}</NativeSelect.Option>
				{/each}
			</NativeSelect.Root>
		</WorkspaceToolbar.Group>
		<WorkspaceToolbar.Group label="Retired rank count" zone="meta">
			<WorkspaceToolbar.Meta>{table.totalRows} shown</WorkspaceToolbar.Meta>
		</WorkspaceToolbar.Group>
	</WorkspaceToolbar.Root>
{/snippet}

{#snippet rankCell(entry: SettingsRankCatalogRow, column: ColumnDef<SettingsRankCatalogRow>)}
	{#if column.key === 'rank'}
		<button
			type="button"
			class="grid max-w-72 gap-0.5 text-left hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
			aria-expanded={isRankExpanded(entry)}
			aria-controls={rankDetailId(entry.code)}
			onclick={() => toggleExpandedRank(entry)}
		>
			<span class="font-medium">{entry.code}</span>
			<span class="truncate text-sm text-muted-foreground">{entry.label}</span>
		</button>
	{:else if column.key === 'branch'}
		<span>{entry.serviceLabel}</span>
	{:else if column.key === 'grade'}
		<span>{entry.payGradeLabel}</span>
	{:else if column.key === 'source'}
		<Badge variant={sourceVariant(entry.source)}>{entry.sourceLabel}</Badge>
	{:else if column.key === 'references'}
		<span class="text-muted-foreground">{totalReferences(entry)}</span>
	{:else if column.key === 'actions'}
		<div class="flex flex-wrap justify-end gap-2">
			{@render rankActions(entry)}
		</div>
	{:else}
		{String(column.value(entry) ?? '')}
	{/if}
{/snippet}

{#snippet rankActions(entry: SettingsRankCatalogRow)}
	{#if entry.commands.canRetire}
		<form method="POST" action="?/retireRank" use:enhance={enhancedForm(`retire-${entry.code}`)}>
			<input type="hidden" name="code" value={entry.code} />
			<Button
				type="submit"
				variant="outline"
				size="sm"
				disabled={savingAction === `retire-${entry.code}`}
				aria-busy={savingAction === `retire-${entry.code}`}
				aria-label={`Retire ${entry.code}`}
			>
				<ArchiveIcon aria-hidden />
				Retire
			</Button>
		</form>
	{/if}
	{#if entry.commands.canReactivate}
		<form method="POST" action="?/reactivateRank" use:enhance={enhancedForm(`reactivate-${entry.code}`)}>
			<input type="hidden" name="code" value={entry.code} />
			<Button
				type="submit"
				variant="outline"
				size="sm"
				disabled={savingAction === `reactivate-${entry.code}`}
				aria-busy={savingAction === `reactivate-${entry.code}`}
				aria-label={`Reactivate ${entry.code}`}
			>
				<RotateCcwIcon aria-hidden />
				Reactivate
			</Button>
		</form>
	{/if}
	{#if entry.commands.canDelete}
		<form method="POST" action="?/deleteRank" use:enhance={enhancedForm(`delete-${entry.code}`)}>
			<input type="hidden" name="code" value={entry.code} />
			<Button
				type="submit"
				variant="destructive"
				size="sm"
				disabled={savingAction === `delete-${entry.code}`}
				aria-busy={savingAction === `delete-${entry.code}`}
				aria-label={`Remove ${entry.code}`}
			>
				<Trash2Icon aria-hidden />
				Remove
			</Button>
		</form>
	{/if}
{/snippet}

{#snippet rankDetail(entry: SettingsRankCatalogRow)}
	{@const domId = rankDomId(entry.code)}
	<div id={rankDetailId(entry.code)} class="grid gap-3">
		<div class="flex flex-wrap items-center gap-2">
			<Badge variant={entry.state === 'active' ? 'secondary' : 'outline'}>{entry.state}</Badge>
			<span class="text-sm text-muted-foreground">
				{entry.serviceLabel} · {entry.categoryLabel} · {entry.payGradeLabel} · tie-break {entry.sortOrder}
			</span>
		</div>

		<div class="grid gap-2 text-sm md:grid-cols-2 xl:grid-cols-4">
			<p><span class="font-medium">Personnel</span> {entry.referenceSummary.activeReferences.personnel}</p>
			<p>
				<span class="font-medium">Training filters</span>
				{entry.referenceSummary.activeReferences.trainingApplicability}
			</p>
			<p>
				<span class="font-medium">Duty templates</span>
				{entry.referenceSummary.activeReferences.dutyRosterTemplateFilters}
			</p>
			<p><span class="font-medium">Historical warnings</span> {entry.referenceSummary.historicalReferences.total}</p>
		</div>

		{#if entry.warnings.length > 0}
			<div class="grid gap-2">
				{#each entry.warnings as warning (warning)}
					<Alert.Root variant="warning">
						<Alert.Description>{warning}</Alert.Description>
					</Alert.Root>
				{/each}
			</div>
		{/if}

		{#if entry.commands.deleteDisabledReason && !entry.commands.canDelete}
			<p class="text-sm text-muted-foreground">{entry.commands.deleteDisabledReason}</p>
		{/if}

		{#if entry.commands.canEdit}
			<div class="rounded-lg border bg-card p-3">
				<div class="mb-3 flex items-center gap-2 text-sm font-medium">
					<PencilIcon aria-hidden class="size-4" />
					Edit rank
				</div>
				<form method="POST" action="?/saveRank" class="grid gap-3" use:enhance={enhancedForm(`edit-${entry.code}`)}>
					<input type="hidden" name="intent" value="edit" />
					<input type="hidden" name="originalCode" value={entry.code} />
					<div class="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
						<div class="grid gap-2">
							<Label for={`${domId}-edit-code`}>Code</Label>
							<Input id={`${domId}-edit-code`} name="code" value={entry.code} readonly />
						</div>
						<div class="grid gap-2">
							<Label for={`${domId}-edit-label`}>Label</Label>
							<Input id={`${domId}-edit-label`} name="label" value={entry.label} maxlength={120} required />
						</div>
						<div class="grid gap-2">
							<Label for={`${domId}-edit-service`}>Service</Label>
							<NativeSelect.Root id={`${domId}-edit-service`} name="service" value={entry.service}>
								{#each ranks.options.services as option (option.value)}
									<NativeSelect.Option value={option.value}>{option.label}</NativeSelect.Option>
								{/each}
							</NativeSelect.Root>
						</div>
						<div class="grid gap-2">
							<Label for={`${domId}-edit-category`}>Category</Label>
							<NativeSelect.Root id={`${domId}-edit-category`} name="category" value={entry.category}>
								{#each ranks.options.categories as option (option.value)}
									<NativeSelect.Option value={option.value}>{option.label}</NativeSelect.Option>
								{/each}
							</NativeSelect.Root>
						</div>
						<div class="grid gap-2">
							<Label for={`${domId}-edit-pay-grade`}>Pay grade</Label>
							<NativeSelect.Root id={`${domId}-edit-pay-grade`} name="payGrade" value={entry.payGrade}>
								{#each ranks.options.payGrades as option (option.value)}
									<NativeSelect.Option value={option.value}>{option.label}</NativeSelect.Option>
								{/each}
							</NativeSelect.Root>
						</div>
						<div class="grid gap-2">
							<Label for={`${domId}-edit-state`}>State</Label>
							<NativeSelect.Root id={`${domId}-edit-state`} name="state" value={entry.state}>
								{#each ranks.options.states as option (option.value)}
									<NativeSelect.Option value={option.value}>{option.label}</NativeSelect.Option>
								{/each}
							</NativeSelect.Root>
						</div>
						<div class="grid gap-1.5">
							<Label for={`${domId}-edit-sort-order`}>Tie-break order</Label>
							<p id={`${domId}-edit-sort-order-help`} class="text-xs text-muted-foreground">
								Only used when ranks share the same pay grade; lower numbers sort earlier.
							</p>
							<Input
								id={`${domId}-edit-sort-order`}
								name="sortOrder"
								type="number"
								value={entry.sortOrder}
								aria-describedby={`${domId}-edit-sort-order-help`}
							/>
						</div>
					</div>
					<div>
						<Button
							type="submit"
							size="sm"
							disabled={savingAction === `edit-${entry.code}`}
							aria-busy={savingAction === `edit-${entry.code}`}
							aria-label={`Save ${entry.code}`}
						>
							<SaveIcon aria-hidden />
							Save
						</Button>
					</div>
				</form>
			</div>
		{/if}
	</div>
{/snippet}
