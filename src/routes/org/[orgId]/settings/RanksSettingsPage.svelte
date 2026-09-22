<script lang="ts">
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import PencilIcon from '@lucide/svelte/icons/pencil';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import SaveIcon from '@lucide/svelte/icons/save';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as ButtonGroup from '$lib/components/ui/button-group/index.js';
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
	import * as DataTable from '$lib/components/ui/data-table/index.js';
	import type { ColumnDef, DataTableRowAction, DataTableState } from '$lib/components/ui/data-table/index.js';
	import * as Empty from '$lib/components/ui/empty/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import * as NativeSelect from '$lib/components/ui/native-select/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import * as WorkspaceToolbar from '$lib/components/ui/workspace-toolbar/index.js';
	import type { RanksSettingsData } from './settingsRanks.server';
	import type { SettingsRankCatalogRow, SettingsRankServicePackOption } from './settingsSectionTypes';

	type RankServiceFilter = SettingsRankCatalogRow['service'] | 'all';
	type RankStateFilter = 'all' | 'active' | 'retired';
	type BulkRankTargetState = 'active' | 'retired';
	type PendingBulkRankState = {
		pack: SettingsRankServicePackOption;
		targetState: BulkRankTargetState;
	};

	let {
		ranksSettings,
		form
	}: {
		ranksSettings: RanksSettingsData;
		form: { [key: string]: unknown; rankError?: string; success?: boolean } | null;
	} = $props();

	let savingAction = $state<string | null>(null);
	let lastActionKey = $state<string | null>(null);
	let stateFilter = $state<RankStateFilter>('active');
	let branchFilter = $state<RankServiceFilter>('all');
	let expandedRankCode = $state<string | null>(null);
	let customRankOpen = $state(false);
	let pendingBulkRankState = $state<PendingBulkRankState | null>(null);
	let pendingRankDelete = $state<SettingsRankCatalogRow | null>(null);

	const ranks = $derived(ranksSettings.sections.ranks);
	const rankError = $derived(typeof form?.rankError === 'string' ? form.rankError : null);
	const actionSucceeded = $derived(Boolean(form?.success));
	const branchFilterOptions = $derived([{ value: 'all' as const, label: 'All branches' }, ...ranks.options.services]);

	const stateFilterOptions: Array<{ value: RankStateFilter; label: string }> = [
		{ value: 'all', label: 'All' },
		{ value: 'active', label: 'Active' },
		{ value: 'retired', label: 'Retired' }
	];

	const allRankRows = $derived([...ranks.entries.active, ...ranks.entries.retired]);
	const hasNoRanks = $derived(allRankRows.length === 0);
	const visibleRankRows = $derived(
		allRankRows.filter(
			(entry) =>
				(stateFilter === 'all' || entry.state === stateFilter) &&
				(branchFilter === 'all' || entry.service === branchFilter)
		)
	);

	// Errors and successes return from the server without telling us which form failed,
	// so attribute them to whichever action last submitted (see enhancedForm).
	const rankErrorScope = $derived<'add' | 'edit' | 'global' | null>(
		!rankError ? null : lastActionKey === 'rank-add' ? 'add' : lastActionKey?.startsWith('edit-') ? 'edit' : 'global'
	);
	const errorEditCode = $derived(
		rankErrorScope === 'edit' && lastActionKey ? lastActionKey.slice('edit-'.length) : null
	);
	const customRankPanelOpen = $derived(customRankOpen || rankErrorScope === 'add');

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
			width: '22rem'
		},
		{
			key: 'branch',
			header: 'Branch',
			value: (entry) => entry.serviceLabel,
			searchValue: (entry) => entry.serviceLabel,
			compare: (a, b) => a.serviceLabel.localeCompare(b.serviceLabel) || compareRankPrecedence(a, b),
			width: '9rem'
		},
		{
			key: 'state',
			header: 'State',
			value: (entry) => entry.state,
			compare: (a, b) => a.state.localeCompare(b.state) || compareRankPrecedence(a, b),
			width: '7rem'
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
			header: 'References',
			value: totalReferences,
			compare: (a, b) => totalReferences(a) - totalReferences(b),
			align: 'right',
			width: '7rem'
		},
		{
			key: 'actions',
			header: '',
			headerAriaLabel: 'Row actions',
			value: () => '',
			searchable: false,
			sortable: false,
			align: 'right',
			width: '4rem'
		}
	];

	function enhancedForm(key: string): SubmitFunction {
		return () => {
			savingAction = key;
			lastActionKey = key;
			return async ({ update }) => {
				try {
					await update();
				} finally {
					savingAction = null;
				}
			};
		};
	}

	function submitFormById(id: string): void {
		const element = document.getElementById(id);
		if (element instanceof HTMLFormElement) element.requestSubmit();
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

	function rowFormId(intent: string, code: string): string {
		return `${rankDomId(code)}-${intent}`;
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
		if (filter === 'all') return 'all branches';
		return ranks.options.services.find((option) => option.value === filter)?.label ?? filter;
	}

	const tableEmptyMessage = $derived(
		`No ${stateFilter === 'all' ? '' : `${stateFilter} `}ranks match ${branchFilterLabel(branchFilter)}.`
	);

	function rankRowActions(entry: SettingsRankCatalogRow): DataTableRowAction<SettingsRankCatalogRow>[] {
		const actions: DataTableRowAction<SettingsRankCatalogRow>[] = [];
		if (entry.commands.canEdit) {
			actions.push({
				label: 'Edit',
				onSelect: () => {
					expandedRankCode = entry.code;
				}
			});
		}
		if (entry.commands.canRetire) {
			actions.push({
				label: 'Retire',
				onSelect: () => submitFormById(rowFormId('retire', entry.code))
			});
		}
		if (entry.commands.canReactivate) {
			actions.push({
				label: 'Reactivate',
				onSelect: () => submitFormById(rowFormId('reactivate', entry.code))
			});
		}
		if (entry.commands.canDelete) {
			actions.push({
				label: 'Remove',
				destructive: true,
				onSelect: () => {
					pendingRankDelete = entry;
				}
			});
		}
		return actions;
	}

	function packActions(pack: SettingsRankServicePackOption): DataTableRowAction<SettingsRankServicePackOption>[] {
		const actions: DataTableRowAction<SettingsRankServicePackOption>[] = [];
		if (pack.canBulkRetire) {
			actions.push({
				label: `Retire active ranks (${pack.activeCount})`,
				onSelect: () => {
					pendingBulkRankState = { pack, targetState: 'retired' };
				}
			});
		}
		if (pack.canBulkReactivate) {
			actions.push({
				label: `Reactivate retired ranks (${pack.retiredCount})`,
				onSelect: () => {
					pendingBulkRankState = { pack, targetState: 'active' };
				}
			});
		}
		return actions;
	}

	function confirmBulkRankState(): void {
		if (!pendingBulkRankState) return;
		const { pack, targetState } = pendingBulkRankState;
		pendingBulkRankState = null;
		submitFormById(`bulk-${targetState}-${pack.value}`);
	}

	function confirmRankDelete(): void {
		if (!pendingRankDelete) return;
		const code = pendingRankDelete.code;
		pendingRankDelete = null;
		submitFormById(rowFormId('delete', code));
	}

	function bulkRankStateCount(pending: PendingBulkRankState): number {
		return pending.targetState === 'retired' ? pending.pack.activeCount : pending.pack.retiredCount;
	}

	function bulkRankStateTitle(pending: PendingBulkRankState): string {
		return pending.targetState === 'retired'
			? `Retire ${pending.pack.label} ranks`
			: `Reactivate ${pending.pack.label} ranks`;
	}

	function bulkRankStateMessage(pending: PendingBulkRankState): string {
		const count = bulkRankStateCount(pending);
		if (pending.targetState === 'retired') {
			return `${count} ${pending.pack.label} built-in ranks will be hidden from future rank selection. Existing Personnel records and historical references stay intact.`;
		}
		return `${count} ${pending.pack.label} built-in ranks will become available for future rank selection again. Existing records stay intact.`;
	}

	function bulkRankStateConfirmLabel(pending: PendingBulkRankState): string {
		return pending.targetState === 'retired' ? 'Retire active ranks' : 'Reactivate retired ranks';
	}
</script>

<div class="grid gap-5">
	<header class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
		<div class="grid gap-1">
			<h2 class="font-heading text-lg font-semibold tracking-tight">Rank Catalog</h2>
			<p class="max-w-prose text-sm text-muted-foreground">
				Manage the Organization vocabulary used for future rank selection, imports, and ordering.
			</p>
		</div>
		<div class="flex flex-wrap items-center gap-2 sm:justify-end">
			<Badge variant="outline">{ranks.entries.active.length} active</Badge>
			<Badge variant="outline">{ranks.entries.retired.length} retired</Badge>
			<Badge variant={ranks.commands.canManageCatalog ? 'secondary' : 'outline'}>
				{ranks.commands.canManageCatalog ? 'Catalog manager' : 'View only'}
			</Badge>
		</div>
	</header>

	{#if actionSucceeded}
		<Alert.Root variant="success">
			<Alert.Description>Rank catalog updated.</Alert.Description>
		</Alert.Root>
	{/if}

	{#if rankError && rankErrorScope === 'global'}
		<Alert.Root variant="destructive">
			<Alert.Description>{rankError}</Alert.Description>
		</Alert.Root>
	{/if}

	{#if !ranks.commands.canManageCatalog}
		<Alert.Root>
			<Alert.Description>
				Organization admin or owner access is required to change branch packs, custom ranks, or retirement state.
			</Alert.Description>
		</Alert.Root>
	{/if}

	<section
		id="rank-branch-coverage"
		class="grid gap-4 rounded-lg border bg-card p-4 text-card-foreground"
		aria-labelledby="rank-service-packs"
	>
		<div class="grid gap-1">
			<h2 id="rank-service-packs" class="font-heading text-lg font-semibold tracking-tight">Branch Coverage</h2>
			<p class="text-sm text-muted-foreground">
				Add missing built-in ranks by branch, or retire and reactivate a whole branch pack from the actions menu.
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
					<div class="flex flex-wrap items-center gap-2 lg:justify-end">
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

						{#if pack.canBulkRetire || pack.canBulkReactivate}
							<form
								id={`bulk-retired-${pack.value}`}
								method="POST"
								action="?/bulkRankState"
								class="hidden"
								use:enhance={enhancedForm(`bulk-retire-${pack.value}`)}
							>
								<input type="hidden" name="service" value={pack.value} />
								<input type="hidden" name="targetState" value="retired" />
							</form>
							<form
								id={`bulk-active-${pack.value}`}
								method="POST"
								action="?/bulkRankState"
								class="hidden"
								use:enhance={enhancedForm(`bulk-reactivate-${pack.value}`)}
							>
								<input type="hidden" name="service" value={pack.value} />
								<input type="hidden" name="targetState" value="active" />
							</form>
							<DataTable.RowActions
								row={pack}
								actions={packActions(pack)}
								ariaLabel={`More actions for ${pack.label}`}
							/>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	</section>

	<div>
		<Button
			type="button"
			variant="outline"
			size="sm"
			disabled={!ranks.commands.canAddCustomRank}
			aria-expanded={customRankPanelOpen}
			aria-controls="add-custom-rank-panel"
			onclick={() => (customRankOpen = !customRankPanelOpen)}
		>
			<PlusIcon aria-hidden />
			{customRankPanelOpen ? 'Hide custom rank form' : 'Add custom rank'}
		</Button>
	</div>

	{#if customRankPanelOpen}
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
			{#if rankError && rankErrorScope === 'add'}
				<Alert.Root variant="destructive">
					<Alert.Description>{rankError}</Alert.Description>
				</Alert.Root>
			{/if}
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
						<Label for="rank-service">Branch</Label>
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
					<div class="grid gap-1.5">
						<Label for="rank-pay-grade">Pay grade</Label>
						<p id="rank-pay-grade-help" class="text-xs text-muted-foreground">{ranks.copy.payGradeHelp}</p>
						<NativeSelect.Root
							id="rank-pay-grade"
							name="payGrade"
							value="ungraded"
							aria-describedby="rank-pay-grade-help"
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
						<p id="rank-sort-order-help" class="text-xs text-muted-foreground">{ranks.copy.tieBreakHelp}</p>
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

	<section class="grid gap-4 rounded-lg border bg-card p-4 text-card-foreground" aria-labelledby="ranks-heading">
		<div class="grid gap-1">
			<h2 id="ranks-heading" class="font-heading text-lg font-semibold tracking-tight">Ranks</h2>
			<p class="text-sm text-muted-foreground">
				Active ranks are available for future selection and import matching; retired ranks are hidden from selection
				while existing references are preserved.
			</p>
		</div>

		{#if hasNoRanks}
			<Empty.Root>
				<Empty.Header>
					<Empty.Title>No ranks in this catalog yet.</Empty.Title>
					<Empty.Description>
						Add a branch pack from Branch Coverage above to import standard ranks, or create a custom rank.
					</Empty.Description>
				</Empty.Header>
				{#if ranks.commands.canAddCustomRank}
					<Empty.Content>
						<Button type="button" variant="outline" size="sm" onclick={() => (customRankOpen = true)}>
							<PlusIcon aria-hidden />
							Add custom rank
						</Button>
					</Empty.Content>
				{/if}
			</Empty.Root>
		{:else}
			<DataTable.DataTable
				data={visibleRankRows}
				columns={rankColumns}
				ariaLabel="Organization ranks"
				emptyMessage={tableEmptyMessage}
				density="dense"
				pageSize={25}
				initialSortKey="rank"
				rowKey={(entry) => entry.code}
				onRowClick={toggleExpandedRank}
				rowActionLabel={(entry) => `${isRankExpanded(entry) ? 'Hide' : 'Show'} details for ${entry.code}`}
				cell={rankCell}
				rowDetail={rankDetail}
				rowDetailVisible={isRankExpanded}
				toolbar={rankToolbar}
			/>
		{/if}
	</section>
</div>

{#if pendingBulkRankState}
	<ConfirmDialog
		title={bulkRankStateTitle(pendingBulkRankState)}
		message={bulkRankStateMessage(pendingBulkRankState)}
		confirmLabel={bulkRankStateConfirmLabel(pendingBulkRankState)}
		variant="warning"
		onConfirm={confirmBulkRankState}
		onCancel={() => (pendingBulkRankState = null)}
	/>
{/if}

{#if pendingRankDelete}
	<ConfirmDialog
		title={`Remove ${pendingRankDelete.code}`}
		message={`${pendingRankDelete.code} ${pendingRankDelete.label} will be permanently removed from the catalog. This cannot be undone.`}
		confirmLabel="Remove rank"
		variant="destructive"
		onConfirm={confirmRankDelete}
		onCancel={() => (pendingRankDelete = null)}
	/>
{/if}

{#snippet rankToolbar(table: DataTableState<SettingsRankCatalogRow>)}
	<WorkspaceToolbar.Root ariaLabel="Rank table controls">
		<WorkspaceToolbar.Group label="Search ranks">
			<DataTable.Search {table} ariaLabel="Search ranks" placeholder="Search ranks" />
		</WorkspaceToolbar.Group>
		<WorkspaceToolbar.Group label="Filter ranks by state">
			<ButtonGroup.Root aria-label="Filter ranks by state">
				{#each stateFilterOptions as option (option.value)}
					<Button
						type="button"
						size="sm"
						variant={stateFilter === option.value ? 'secondary' : 'outline'}
						aria-pressed={stateFilter === option.value}
						onclick={() => (stateFilter = option.value)}
					>
						{option.label}
					</Button>
				{/each}
			</ButtonGroup.Root>
		</WorkspaceToolbar.Group>
		<WorkspaceToolbar.Group label="Filter ranks by branch">
			<NativeSelect.Root
				id="rank-branch-filter"
				size="sm"
				bind:value={branchFilter}
				aria-label="Filter ranks by branch"
			>
				{#each branchFilterOptions as option (option.value)}
					<NativeSelect.Option value={option.value}>{option.label}</NativeSelect.Option>
				{/each}
			</NativeSelect.Root>
		</WorkspaceToolbar.Group>
		<WorkspaceToolbar.Group label="Rank count" zone="meta">
			<WorkspaceToolbar.Meta>{table.totalRows} shown</WorkspaceToolbar.Meta>
		</WorkspaceToolbar.Group>
	</WorkspaceToolbar.Root>
{/snippet}

{#snippet rankCell(entry: SettingsRankCatalogRow, column: ColumnDef<SettingsRankCatalogRow>)}
	{#if column.key === 'rank'}
		<div class="flex max-w-80 items-start gap-2">
			<button
				type="button"
				class="mt-0.5 rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
				aria-expanded={isRankExpanded(entry)}
				aria-controls={rankDetailId(entry.code)}
				aria-label={`${isRankExpanded(entry) ? 'Hide' : 'Show'} details for ${entry.code}`}
				onclick={() => toggleExpandedRank(entry)}
			>
				<ChevronRightIcon
					aria-hidden
					class="size-4 transition-transform duration-150 motion-reduce:transition-none {isRankExpanded(entry)
						? 'rotate-90'
						: ''}"
				/>
			</button>
			<span class="grid min-w-0 gap-0.5">
				<span class="font-medium">{entry.code}</span>
				<span class="truncate text-sm text-muted-foreground">{entry.label}</span>
			</span>
		</div>
	{:else if column.key === 'branch'}
		<span>{entry.serviceLabel}</span>
	{:else if column.key === 'state'}
		<Badge variant={entry.state === 'active' ? 'secondary' : 'outline'}>{entry.state}</Badge>
	{:else if column.key === 'grade'}
		<span>{entry.payGradeLabel}</span>
	{:else if column.key === 'source'}
		<Badge variant={sourceVariant(entry.source)}>{entry.sourceLabel}</Badge>
	{:else if column.key === 'references'}
		<span class="text-muted-foreground">{totalReferences(entry)}</span>
	{:else if column.key === 'actions'}
		<div class="flex justify-end">
			{@render rankRowForms(entry)}
			{#if rankRowActions(entry).length > 0}
				<DataTable.RowActions row={entry} actions={rankRowActions(entry)} ariaLabel={`Actions for ${entry.code}`} />
			{/if}
		</div>
	{:else}
		{String(column.value(entry) ?? '')}
	{/if}
{/snippet}

{#snippet rankRowForms(entry: SettingsRankCatalogRow)}
	{#if entry.commands.canRetire}
		<form
			id={rowFormId('retire', entry.code)}
			method="POST"
			action="?/retireRank"
			class="hidden"
			use:enhance={enhancedForm(`retire-${entry.code}`)}
		>
			<input type="hidden" name="code" value={entry.code} />
		</form>
	{/if}
	{#if entry.commands.canReactivate}
		<form
			id={rowFormId('reactivate', entry.code)}
			method="POST"
			action="?/reactivateRank"
			class="hidden"
			use:enhance={enhancedForm(`reactivate-${entry.code}`)}
		>
			<input type="hidden" name="code" value={entry.code} />
		</form>
	{/if}
	{#if entry.commands.canDelete}
		<form
			id={rowFormId('delete', entry.code)}
			method="POST"
			action="?/deleteRank"
			class="hidden"
			use:enhance={enhancedForm(`delete-${entry.code}`)}
		>
			<input type="hidden" name="code" value={entry.code} />
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
				{#if rankError && errorEditCode === entry.code}
					<Alert.Root variant="destructive" class="mb-3">
						<Alert.Description>{rankError}</Alert.Description>
					</Alert.Root>
				{/if}
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
							<Label for={`${domId}-edit-service`}>Branch</Label>
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
						<div class="grid gap-1.5">
							<Label for={`${domId}-edit-pay-grade`}>Pay grade</Label>
							<p id={`${domId}-edit-pay-grade-help`} class="text-xs text-muted-foreground">{ranks.copy.payGradeHelp}</p>
							<NativeSelect.Root
								id={`${domId}-edit-pay-grade`}
								name="payGrade"
								value={entry.payGrade}
								aria-describedby={`${domId}-edit-pay-grade-help`}
							>
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
								{ranks.copy.tieBreakHelp}
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
