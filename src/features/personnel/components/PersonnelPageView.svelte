<script lang="ts">
	import { personnelStore } from '$features/personnel/stores/personnel.svelte';
	import { pinnedGroupsStore } from '$lib/stores/pinnedGroups.svelte';
	import { subscriptionStore } from '$lib/stores/subscription.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import * as ButtonGroup from '$lib/components/ui/button-group';
	import * as DataTable from '$lib/components/ui/data-table';
	import { Input } from '$lib/components/ui/input';
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

	const handleRowClick = $derived.by(
		() => (person: Personnel) => (ctx.canManagePersonnelRecord(person) ? ctx.handleEdit(person) : undefined)
	);

	function setRosterSearch(value: string): void {
		rosterSearch = value;
		azTable.setSearch(value);
		groupedTable.setSearch(value);
	}

	function handleRosterSearchInput(event: Event): void {
		setRosterSearch((event.currentTarget as HTMLInputElement).value);
	}

	function getPersonnelRowActionLabel(person: Personnel): string {
		return `Edit ${person.rank} ${person.lastName}, ${person.firstName}`;
	}
</script>

<svelte:head>
	<title>Personnel - Troop to Task</title>
</svelte:head>

<div class="flex h-full min-h-0 flex-col overflow-hidden bg-background">
	{#if !canViewRoster}
		<div
			class="m-6 flex min-h-80 flex-col items-center justify-center rounded-lg border bg-card p-8 text-center text-muted-foreground"
		>
			<h2 class="mb-2 text-2xl font-semibold tracking-tight text-foreground">Access Restricted</h2>
			<p class="m-0 max-w-prose leading-relaxed">
				You don't have permission to view this area. Contact your organization admin for access.
			</p>
		</div>
	{:else}
		<main class="flex min-h-0 flex-col gap-4 overflow-hidden px-6 pt-4 pb-5 max-sm:p-3">
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
						value={rosterSearch}
						onValueChange={setRosterSearch}
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
				<div
					class="flex items-center justify-between gap-4 rounded-lg border bg-card p-5 max-sm:flex-col max-sm:items-stretch"
				>
					<div>
						<span class="text-xs font-medium tracking-widest text-muted-foreground uppercase"
							>Grouped roster paused</span
						>
						<p class="mt-2 max-w-prose text-sm leading-relaxed text-muted-foreground">
							{groupedTable.totalRows} personnel are loaded. Search within the roster or switch to the paged A-Z view to keep
							this page fast.
						</p>
					</div>
					<div
						class="flex min-w-[min(100%,300px)] flex-[0_1_420px] items-center gap-2 max-sm:flex-auto max-sm:flex-col max-sm:items-stretch"
					>
						<Input
							type="search"
							aria-label="Search by name, rank, MOS, role, or group"
							placeholder="Search roster..."
							value={rosterSearch}
							oninput={handleRosterSearchInput}
						/>
						<Button size="sm" type="button" onclick={() => (ctx.viewMode = 'alphabetical')}>Use A-Z View</Button>
					</div>
				</div>
			{:else}
				<div
					class="flex min-h-0 min-w-0 flex-1 [&_[data-slot='data-table']]:min-h-0 [&_[data-slot='data-table']]:w-full [&_[data-slot='data-table']]:flex-1"
				>
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
