<script lang="ts">
	import { personnelStore } from '$features/personnel/stores/personnel.svelte';
	import { pinnedGroupsStore } from '$lib/stores/pinnedGroups.svelte';
	import { subscriptionStore } from '$lib/stores/subscription.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as ButtonGroup from '$lib/components/ui/button-group';
	import * as DataTable from '$lib/components/ui/data-table';
	import { Toggle } from '$lib/components/ui/toggle';
	import { useDataTable } from '$lib/components/ui/data-table';
	import type { ColumnDef } from '$lib/components/ui/data-table';
	import * as WorkspaceToolbar from '$lib/components/ui/workspace-toolbar';
	import type { PersonnelPageContext } from '$features/personnel/contexts/PersonnelPageContext.svelte';
	import type { Personnel } from '$lib/types';
	import PinIcon from '@lucide/svelte/icons/pin';

	interface Props {
		ctx: PersonnelPageContext;
		permissions: import('$lib/types').OrganizationMemberPermissions | null | undefined;
	}

	let { ctx, permissions }: Props = $props();

	const ROSTER_PAGE_SIZE = 75;
	const GROUPED_ROSTER_RENDER_LIMIT = 250;
	const rosterViewOptions = [
		{ value: 'alphabetical', label: 'A-Z' },
		{ value: 'by-group', label: 'Group' }
	];

	const readOnly = $derived(subscriptionStore.billingEnabled && subscriptionStore.isReadOnly);
	const canViewRoster = $derived(permissions?.canViewPersonnel ?? false);
	const upcomingLossMap = $derived(ctx.upcomingLossMap);
	const canAddPersonnel = $derived(ctx.canAddPersonnel);
	const canImportPersonnel = $derived(ctx.canImportPersonnel);
	const canManageGroups = $derived(ctx.canManageGroups);
	const canManageAnyRosterRecord = $derived.by(() =>
		personnelStore.items.some((person) => ctx.canManagePersonnelRecord(person))
	);

	const hasPersonnelActions = $derived(canImportPersonnel || canManageGroups || canAddPersonnel);

	// Personnel DataTable setup
	const personnelColumns = $derived.by<ColumnDef<Personnel>[]>(() => {
		const columns: ColumnDef<Personnel>[] = [
			{ key: 'rank', header: 'Rank', value: (p) => p.rank },
			{
				key: 'name',
				header: 'Name',
				value: (p) => `${p.lastName}, ${p.firstName}`,
				compare: (a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName)
			},
			{ key: 'mos', header: 'MOS', value: (p) => p.mos },
			{ key: 'role', header: 'Duty Role', value: (p) => p.clinicRole },
			{ key: 'group', header: 'Group', value: (p) => p.groupName }
		];

		if (canManageAnyRosterRecord) {
			columns.push({
				key: 'actions',
				header: 'Actions',
				value: () => '',
				searchable: false,
				sortable: false
			});
		}

		return columns;
	});

	const azTable = useDataTable<Personnel>({
		data: () => personnelStore.items,
		columns: () => personnelColumns,
		initialSortKey: 'name',
		initialSortDirection: 'asc',
		pageSize: ROSTER_PAGE_SIZE
	});

	const groupedTable = useDataTable<Personnel>({
		data: () => personnelStore.items,
		columns: () => personnelColumns,
		initialSortKey: 'name',
		initialSortDirection: 'asc',
		groupBy: {
			key: (p) => p.groupName || 'Unassigned',
			compare: (a, b) => {
				const aPin = pinnedGroupsStore.list.includes(a) ? 0 : 1;
				const bPin = pinnedGroupsStore.list.includes(b) ? 0 : 1;
				if (aPin !== bPin) return aPin - bPin;
				return a.localeCompare(b);
			}
		}
	});

	let rosterSearch = $state('');
	const activeRosterFilterCount = $derived((ctx.viewMode !== 'alphabetical' ? 1 : 0) + (rosterSearch.trim() ? 1 : 0));
	const shouldGateGroupedRoster = $derived(
		ctx.viewMode === 'by-group' && !rosterSearch.trim() && groupedTable.totalRows > GROUPED_ROSTER_RENDER_LIMIT
	);

	$effect(() => {
		azTable.setSearch(rosterSearch);
		groupedTable.setSearch(rosterSearch);
	});

	const handleRowClick = $derived.by(
		() => (person: Personnel) => (ctx.canManagePersonnelRecord(person) ? ctx.handleEdit(person) : undefined)
	);

	function getPersonnelRowActionLabel(person: Personnel): string {
		return `Edit ${person.rank} ${person.lastName}, ${person.firstName}`;
	}
</script>

<svelte:head>
	<title>Personnel - Troop to Task</title>
</svelte:head>

<div class="page">
	{#if !canViewRoster}
		<div class="no-permission">
			<h2>Access Restricted</h2>
			<p>You don't have permission to view this area. Contact your organization admin for access.</p>
		</div>
	{:else}
		<main class="page-content roster-content">
			<WorkspaceToolbar.Root ariaLabel="Personnel controls">
				<WorkspaceToolbar.Group
					label="Roster filters"
					activeCount={activeRosterFilterCount}
					data-testid="personnel-roster-filters"
				>
					<ButtonGroup.Root aria-label="Roster sort mode">
						{#each rosterViewOptions as option (option.value)}
							<Button
								variant={ctx.viewMode === option.value ? 'secondary' : 'outline'}
								aria-pressed={ctx.viewMode === option.value}
								onclick={() => (ctx.viewMode = option.value as 'alphabetical' | 'by-group')}
							>
								{option.label}
							</Button>
						{/each}
					</ButtonGroup.Root>
					<WorkspaceToolbar.Search
						testId="personnel-search"
						ariaLabel="Search by name, rank, MOS, role, or group"
						placeholder="Search name, rank, MOS, role, or group..."
						bind:value={rosterSearch}
					/>
				</WorkspaceToolbar.Group>

				{#if hasPersonnelActions}
					<WorkspaceToolbar.Group label="Personnel actions" zone="actions">
						{#if canImportPersonnel}
							<Button variant="outline" disabled={readOnly} onclick={() => ctx.openBulkManager()}>Import</Button>
						{/if}
						{#if canManageGroups}
							<Button variant="secondary" disabled={readOnly} onclick={() => ctx.openGroupManager()}
								>Manage Groups</Button
							>
						{/if}
						{#if canAddPersonnel}
							<Button disabled={readOnly} onclick={() => ctx.handleAdd()}>Add Person</Button>
						{/if}
					</WorkspaceToolbar.Group>
					{#if readOnly}
						<WorkspaceToolbar.Group label="Personnel edit status" zone="meta">
							<WorkspaceToolbar.Meta tone="warning">Upgrade to edit</WorkspaceToolbar.Meta>
						</WorkspaceToolbar.Group>
					{/if}
				{/if}
			</WorkspaceToolbar.Root>

			{#if ctx.totalPersonnel === 0}
				<EmptyState
					message="No personnel on the active roster. Add one person, or use the actions menu for Bulk Import when you have a roster file."
					actionLabel={canAddPersonnel ? 'Add Person' : undefined}
					onAction={canAddPersonnel ? () => ctx.handleAdd() : undefined}
				/>
			{:else if shouldGateGroupedRoster}
				<div class="roster-scale-guard">
					<div>
						<span class="scale-kicker">Grouped roster paused</span>
						<p>
							{groupedTable.totalRows} personnel are loaded. Search within the roster or switch to the paged A-Z view to keep
							this page fast.
						</p>
					</div>
					<div class="scale-actions">
						<input
							type="search"
							class="input scale-search"
							aria-label="Search by name, rank, MOS, role, or group"
							placeholder="Search roster..."
							bind:value={rosterSearch}
						/>
						<button class="btn btn-primary btn-sm" type="button" onclick={() => (ctx.viewMode = 'alphabetical')}>
							Use A-Z View
						</button>
					</div>
				</div>
			{:else}
				<div class="roster-table-region">
					<DataTable.DataTable
						table={ctx.viewMode === 'alphabetical' ? azTable : groupedTable}
						columns={personnelColumns}
						onRowClick={handleRowClick}
						rowActionLabel={(person) =>
							ctx.canManagePersonnelRecord(person) ? getPersonnelRowActionLabel(person) : ''}
						ariaLabel="Personnel roster"
						emptyMessage="No personnel match your search."
						maxHeight="100%"
					>
						{#snippet cell(row, col)}
							{@const lossRecord = upcomingLossMap.get(row.id)}
							{#if col.key === 'name'}
								{row.lastName}, {row.firstName}
								{#if lossRecord}
									<Badge
										variant={lossRecord.triggerType === 'ETS' ? 'secondary' : 'outline'}
										data-testid="loss-indicator-{row.id}"
										title="{lossRecord.triggerType} in {lossRecord.daysRemaining} day{lossRecord.daysRemaining === 1
											? ''
											: 's'}"
									>
										{lossRecord.triggerType === 'ETS' ? 'ETS' : 'PCS'}
									</Badge>
								{/if}
							{:else if col.key === 'actions'}
								{#if ctx.canManagePersonnelRecord(row)}
									<Button type="button" variant="outline" size="sm" onclick={() => ctx.handleEdit(row)}>Edit</Button>
								{/if}
							{:else}
								{String(col.value(row) ?? '')}
							{/if}
						{/snippet}
						{#snippet groupHeader(group)}
							<Toggle
								size="sm"
								class="data-[state=on]:bg-transparent data-[state=on]:*:[svg]:fill-primary data-[state=on]:*:[svg]:stroke-primary"
								pressed={pinnedGroupsStore.list.includes(group.key)}
								onPressedChange={() => pinnedGroupsStore.toggle(group.key)}
								title={pinnedGroupsStore.list.includes(group.key) ? 'Unpin group' : 'Pin group to top'}
								aria-label={pinnedGroupsStore.list.includes(group.key) ? `Unpin ${group.label}` : `Pin ${group.label}`}
							>
								<PinIcon />
							</Toggle>
							<Button
								type="button"
								variant="ghost"
								class="border-0 bg-transparent shadow-none"
								onclick={group.toggle}
								aria-expanded={!group.collapsed}
								aria-label={`${group.collapsed ? 'Expand' : 'Collapse'} ${group.label}`}
							>
								{group.label}
								<Badge variant="outline">{group.count}</Badge>
							</Button>
						{/snippet}
					</DataTable.DataTable>
				</div>
			{/if}
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
		background: var(--surface-page);
	}

	.page-content.roster-content {
		display: flex;
		min-height: 0;
		flex-direction: column;
		gap: var(--sp-4);
		overflow: hidden;
		padding: var(--sp-4) var(--sp-6) var(--sp-5);
	}

	.roster-table-region {
		display: flex;
		flex: 1 1 auto;
		min-height: 0;
		min-width: 0;
	}

	.roster-table-region :global([data-slot='data-table']) {
		width: 100%;
		flex: 1 1 auto;
		min-height: 0;
	}

	.roster-scale-guard {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--sp-4);
		padding: var(--sp-5);
		border: var(--border-thin);
		border-radius: var(--radius-lg);
		background: color-mix(in srgb, var(--surface-panel) 88%, var(--surface-subtle) 12%);
	}

	.roster-scale-guard p {
		margin: var(--sp-2) 0 0;
		color: var(--text-secondary);
		line-height: var(--line-height-copy);
		max-width: 68ch;
	}

	.scale-actions {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		flex: 0 1 420px;
		min-width: min(100%, 300px);
	}

	.scale-search {
		min-width: 0;
	}

	.scale-kicker {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		font-weight: var(--font-weight-semibold);
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--amber-dark);
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
		.page-content.roster-content {
			padding: var(--sp-3);
		}

		.roster-scale-guard {
			flex-direction: column;
			align-items: stretch;
		}

		.scale-actions {
			flex-direction: column;
			align-items: stretch;
			flex-basis: auto;
		}
	}

	@media (min-width: 641px) and (max-width: 1024px) {
	}
</style>
