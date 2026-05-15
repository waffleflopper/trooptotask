<script lang="ts">
	import { goto } from '$app/navigation';
	import { personnelStore } from '$features/personnel/stores/personnel.svelte';
	import { pinnedGroupsStore } from '$lib/stores/pinnedGroups.svelte';
	import { subscriptionStore } from '$lib/stores/subscription.svelte';
	import UsersIcon from '@lucide/svelte/icons/users';
	import { Badge, badgeVariants } from '$lib/components/ui/badge';
	import { Button, buttonVariants } from '$lib/components/ui/button';
	import * as ButtonGroup from '$lib/components/ui/button-group';
	import * as DataTable from '$lib/components/ui/data-table';
	import * as Empty from '$lib/components/ui/empty/index.js';
	import { Input } from '$lib/components/ui/input';
	import { useDataTable } from '$lib/components/ui/data-table';
	import { cn } from '$lib/utils.js';
	import type { ColumnDef } from '$lib/components/ui/data-table';
	import * as WorkspaceToolbar from '$lib/components/ui/workspace-toolbar';
	import type { PersonnelPageContext } from '$features/personnel/contexts/PersonnelPageContext.svelte';
	import type { Personnel } from '$lib/types';

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

		if (canViewRoster) {
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

	const handleRowClick = $derived.by(() => (person: Personnel) => openPersonnelDetail(person));

	function openPersonnelDetail(person: Personnel): void {
		void goto(`/org/${ctx.orgId}/personnel/${person.slug ?? person.id}`);
	}

	function setRosterSearch(value: string): void {
		rosterSearch = value;
		azTable.setSearch(value);
		groupedTable.setSearch(value);
	}

	function handleRosterSearchInput(event: Event): void {
		setRosterSearch((event.currentTarget as HTMLInputElement).value);
	}

	function getPersonnelRowActionLabel(person: Personnel): string {
		return `Open ${person.rank} ${person.lastName}, ${person.firstName}`;
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
				<Empty.Root class="border-border bg-card">
					<Empty.Header>
						<Empty.Media variant="icon">
							<UsersIcon aria-hidden="true" />
						</Empty.Media>
						<Empty.Title>No personnel on the active roster</Empty.Title>
						<Empty.Description>Add one person, or use Import when you have a roster file.</Empty.Description>
					</Empty.Header>
					{#if canAddPersonnel}
						<Empty.Content>
							<Button disabled={readOnly} onclick={() => ctx.handleAdd()}>Add Person</Button>
						</Empty.Content>
					{/if}
				</Empty.Root>
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
						rowActionLabel={getPersonnelRowActionLabel}
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
								<div class="flex items-center justify-end gap-2">
									{#if ctx.canManagePersonnelRecord(row)}
										<Button type="button" variant="outline" size="sm" onclick={() => ctx.handleEdit(row)}>Edit</Button>
									{/if}
									<Button type="button" variant="secondary" size="sm" onclick={() => openPersonnelDetail(row)}
										>Details</Button
									>
								</div>
							{:else}
								{String(col.value(row) ?? '')}
							{/if}
						{/snippet}
						{#snippet groupHeader(group)}
							<button
								type="button"
								class={cn(
									buttonVariants({ variant: 'ghost', size: 'icon-sm' }),
									'data-[state=on]:bg-transparent data-[state=on]:*:[svg]:fill-primary data-[state=on]:*:[svg]:stroke-primary'
								)}
								data-state={pinnedGroupsStore.list.includes(group.key) ? 'on' : 'off'}
								aria-pressed={pinnedGroupsStore.list.includes(group.key)}
								onclick={() => pinnedGroupsStore.toggle(group.key)}
								title={pinnedGroupsStore.list.includes(group.key) ? 'Unpin group' : 'Pin group to top'}
								aria-label={pinnedGroupsStore.list.includes(group.key) ? `Unpin ${group.label}` : `Pin ${group.label}`}
							>
								<svg
									aria-hidden="true"
									xmlns="http://www.w3.org/2000/svg"
									width="24"
									height="24"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"
								>
									<path d="M12 17v5" />
									<path
										d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"
									/>
								</svg>
							</button>
							<button
								type="button"
								class={cn(buttonVariants({ variant: 'ghost' }), 'border-0 bg-transparent shadow-none')}
								onclick={group.toggle}
								aria-expanded={!group.collapsed}
								aria-label={`${group.collapsed ? 'Expand' : 'Collapse'} ${group.label}`}
							>
								{group.label}
								<span class={badgeVariants({ variant: 'outline' })}>{group.count}</span>
							</button>
						{/snippet}
					</DataTable.DataTable>
				</div>
			{/if}
		</main>
	{/if}
</div>
