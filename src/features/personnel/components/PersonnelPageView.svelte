<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { personnelStore } from '$features/personnel/stores/personnel.svelte';
	import { archivePersonnel } from '$features/personnel/utils/archivePersonnel';
	import { bulkArchivePersonnel } from '$features/personnel/utils/bulkArchivePersonnel';
	import { pinnedGroupsStore } from '$lib/stores/pinnedGroups.svelte';
	import { toastStore } from '$lib/stores/toast.svelte';
	import ArchiveIcon from '@lucide/svelte/icons/archive';
	import DownloadIcon from '@lucide/svelte/icons/download';
	import UsersIcon from '@lucide/svelte/icons/users';
	import { Badge, badgeVariants } from '$lib/components/ui/badge';
	import { Button, buttonVariants } from '$lib/components/ui/button';
	import * as ButtonGroup from '$lib/components/ui/button-group';
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
	import * as DataTable from '$lib/components/ui/data-table';
	import * as Empty from '$lib/components/ui/empty/index.js';
	import { Input } from '$lib/components/ui/input';
	import { useDataTable } from '$lib/components/ui/data-table';
	import { cn } from '$lib/utils.js';
	import type { ColumnDef } from '$lib/components/ui/data-table';
	import * as WorkspaceToolbar from '$lib/components/ui/workspace-toolbar';
	import type { PersonnelPageContext } from '$features/personnel/contexts/PersonnelPageContext.svelte';
	import type { Personnel } from '$lib/types';
	import { SvelteSet } from 'svelte/reactivity';

	interface Props {
		ctx: PersonnelPageContext;
		permissions: import('$lib/types').OrganizationMemberPermissions | null | undefined;
	}

	let { ctx, permissions }: Props = $props();
	const orgUrlSegment = $derived(ctx.orgUrlSegment ?? ctx.orgId);

	const ROSTER_PAGE_SIZE = 75;
	const GROUPED_ROSTER_RENDER_LIMIT = 250;
	const rosterViewOptions = [
		{ value: 'alphabetical', label: 'A-Z' },
		{ value: 'by-group', label: 'Group' }
	];

	const readOnly = $derived(ctx.readOnly);
	const canViewRoster = $derived(permissions?.canViewPersonnel ?? false);
	const upcomingLossMap = $derived(ctx.upcomingLossMap);
	const canAddPersonnel = $derived(ctx.canAddPersonnel);
	const canImportPersonnel = $derived(ctx.canImportPersonnel);
	const canManageGroups = $derived(ctx.canManageGroups);
	const canBulkArchivePersonnel = $derived(
		personnelStore.items.some((person) => ctx.canArchivePersonnelRecord(person))
	);
	const hasPersonnelActions = $derived(
		canImportPersonnel || canManageGroups || canAddPersonnel || canBulkArchivePersonnel
	);

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

		if (bulkArchiveMode) {
			columns.unshift({ key: 'select', header: '', value: () => '', searchable: false, sortable: false });
		}

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
	let archiveTarget = $state<Personnel | null>(null);
	let archiveSubmitting = $state(false);
	let bulkArchiveMode = $state(false);
	let bulkArchiveSubmitting = $state(false);
	let showBulkArchiveConfirm = $state(false);
	let selectedArchiveIds = new SvelteSet<string>();
	const activeRosterFilterCount = $derived((ctx.viewMode !== 'alphabetical' ? 1 : 0) + (rosterSearch.trim() ? 1 : 0));
	const shouldGateGroupedRoster = $derived(
		ctx.viewMode === 'by-group' && !rosterSearch.trim() && groupedTable.totalRows > GROUPED_ROSTER_RENDER_LIMIT
	);
	const selectedArchivePersonnel = $derived(
		personnelStore.items.filter((person) => selectedArchiveIds.has(person.id) && ctx.canArchivePersonnelRecord(person))
	);

	const handleRowClick = $derived.by(() => (person: Personnel) => {
		if (bulkArchiveMode) {
			toggleArchiveSelection(person.id);
			return;
		}
		if (ctx.canManagePersonnelRecord(person)) openPersonnelDetail(person);
	});

	function openPersonnelDetail(person: Personnel): void {
		void goto(resolve(`/org/${orgUrlSegment}/personnel/${person.slug ?? person.id}`));
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

	function promptArchive(event: MouseEvent, person: Personnel): void {
		event.stopPropagation();
		archiveTarget = person;
	}

	function toggleArchiveMode(): void {
		bulkArchiveMode = !bulkArchiveMode;
		selectedArchiveIds.clear();
	}

	function cancelArchiveMode(): void {
		bulkArchiveMode = false;
		selectedArchiveIds.clear();
		showBulkArchiveConfirm = false;
	}

	function toggleArchiveSelection(id: string): void {
		const person = personnelStore.items.find((item) => item.id === id);
		if (!person || !ctx.canArchivePersonnelRecord(person)) return;

		if (selectedArchiveIds.has(id)) {
			selectedArchiveIds.delete(id);
		} else {
			selectedArchiveIds.add(id);
		}
	}

	function selectVisibleArchiveRows(): void {
		const table = ctx.viewMode === 'alphabetical' ? azTable : groupedTable;
		for (const person of table.rows) {
			if (ctx.canArchivePersonnelRecord(person)) selectedArchiveIds.add(person.id);
		}
	}

	function clearArchiveSelection(): void {
		selectedArchiveIds.clear();
	}

	async function confirmArchive(): Promise<void> {
		if (!archiveTarget || archiveSubmitting) return;
		archiveSubmitting = true;
		try {
			const result = await archivePersonnel({ orgId: ctx.orgId, person: archiveTarget });
			if (result === 'archived') {
				await invalidateAll();
			}
			archiveTarget = null;
		} finally {
			archiveSubmitting = false;
		}
	}

	async function confirmBulkArchive(): Promise<void> {
		if (selectedArchiveIds.size === 0 || bulkArchiveSubmitting) return;
		bulkArchiveSubmitting = true;
		try {
			const result = await bulkArchivePersonnel(
				ctx.orgId,
				selectedArchivePersonnel.map((person) => person.id)
			);

			for (const id of result.archivedIds) {
				personnelStore.removeLocal(id);
			}

			if (result.archivedIds.length > 0) {
				toastStore.success(`${result.archivedIds.length} personnel archived`);
			}
			if (result.approvalRequestedIds.length > 0) {
				toastStore.info(`${result.approvalRequestedIds.length} archival requests submitted for admin approval.`);
			}
			if (result.errors.length > 0) {
				toastStore.error(`${result.errors.length} personnel could not be archived.`);
			}
			if (result.archivedIds.length > 0 || result.approvalRequestedIds.length > 0) {
				await invalidateAll();
			}
			selectedArchiveIds.clear();
			showBulkArchiveConfirm = false;
			bulkArchiveMode = false;
		} finally {
			bulkArchiveSubmitting = false;
		}
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
							<Button variant="outline" disabled={readOnly} href={resolve(`/org/${orgUrlSegment}/personnel/import`)}>
								<DownloadIcon aria-hidden="true" />
								Import
							</Button>
						{/if}
						{#if canBulkArchivePersonnel}
							<Button variant={bulkArchiveMode ? 'secondary' : 'outline'} onclick={toggleArchiveMode}>
								<ArchiveIcon aria-hidden="true" />
								Archive
							</Button>
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
						rowActionLabel={bulkArchiveMode
							? (person) => `Select ${person.rank} ${person.lastName}`
							: getPersonnelRowActionLabel}
						ariaLabel="Personnel roster"
						emptyMessage="No personnel match your search."
						maxHeight="100%"
					>
						{#snippet toolbar(tbl)}
							{#if bulkArchiveMode}
								<div class="flex flex-wrap items-center justify-between gap-2">
									<DataTable.BulkActions selectedCount={selectedArchiveIds.size} totalCount={tbl.totalRows}>
										<Button type="button" variant="outline" size="sm" onclick={selectVisibleArchiveRows}
											>Select shown</Button
										>
										<Button type="button" variant="outline" size="sm" onclick={clearArchiveSelection}>Clear</Button>
									</DataTable.BulkActions>
									<div class="flex flex-wrap gap-2">
										<Button type="button" variant="outline" size="sm" onclick={cancelArchiveMode}>Cancel</Button>
										<Button
											type="button"
											variant="destructive"
											size="sm"
											disabled={selectedArchiveIds.size === 0}
											onclick={() => (showBulkArchiveConfirm = true)}
										>
											Confirm Archive
										</Button>
									</div>
								</div>
							{/if}
						{/snippet}
						{#snippet cell(row, col)}
							{@const lossRecord = upcomingLossMap.get(row.id)}
							{#if col.key === 'select'}
								{@const canArchive = ctx.canArchivePersonnelRecord(row)}
								<DataTable.SelectionCheckbox
									checked={canArchive && selectedArchiveIds.has(row.id)}
									disabled={!canArchive}
									ariaLabel={canArchive
										? `Select ${row.rank} ${row.lastName}, ${row.firstName}`
										: `${row.rank} ${row.lastName}, ${row.firstName} cannot be archived`}
									onCheckedChange={canArchive ? () => toggleArchiveSelection(row.id) : undefined}
								/>
							{:else if col.key === 'name'}
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
									{#if !bulkArchiveMode && ctx.canManagePersonnelRecord(row)}
										<Button type="button" variant="outline" size="sm" onclick={() => ctx.handleEdit(row)}>Edit</Button>
										<Button type="button" variant="secondary" size="sm" onclick={() => openPersonnelDetail(row)}
											>Details</Button
										>
									{/if}
									{#if !bulkArchiveMode && ctx.canArchivePersonnelRecord(row)}
										<Button
											type="button"
											variant="destructive"
											size="icon-sm"
											title="Archive {row.rank} {row.lastName}, {row.firstName}"
											aria-label="Archive {row.rank} {row.lastName}, {row.firstName}"
											onclick={(event) => promptArchive(event, row)}
										>
											<ArchiveIcon aria-hidden="true" />
										</Button>
									{/if}
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

{#if archiveTarget}
	<ConfirmDialog
		title="Archive Personnel"
		message="Archive {archiveTarget.rank} {archiveTarget.lastName}? They will be removed from active rosters, calendars, and reports, but their records remain available in archived personnel."
		confirmLabel="Archive"
		variant="warning"
		loading={archiveSubmitting}
		onConfirm={confirmArchive}
		onCancel={() => (archiveTarget = null)}
	/>
{/if}

{#if showBulkArchiveConfirm}
	<ConfirmDialog
		title="Archive Personnel"
		message="Archive {selectedArchiveIds.size} personnel? They will leave active rosters, calendars, and reports. Records are not erased, and some archives may require approval."
		confirmLabel="Archive"
		variant="warning"
		loading={bulkArchiveSubmitting}
		onConfirm={confirmBulkArchive}
		onCancel={() => (showBulkArchiveConfirm = false)}
	/>
{/if}
