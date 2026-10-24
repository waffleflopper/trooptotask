<script lang="ts">
	import { goto, invalidate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { personnelStore } from '$features/personnel/stores/personnel.svelte';
	import { groupManagementStore } from '$features/personnel/stores/groups.svelte';
	import { pinnedGroupsStore } from '../stores/pinnedGroups.svelte';
	import UsersIcon from '@lucide/svelte/icons/users';
	import * as Alert from '$lib/components/ui/alert';
	import { Button } from '$lib/components/ui/button';
	import * as DataTable from '$lib/components/ui/data-table';
	import * as Empty from '$lib/components/ui/empty/index.js';
	import { useDataTable } from '$lib/components/ui/data-table';
	import type { ColumnDef } from '$lib/components/ui/data-table';
	import {
		WorkspaceToolbar,
		type ToolbarItem,
		type WorkspaceToolbarProps
	} from '$lib/components/patterns/workspace-toolbar';
	import type { PersonnelPageContext } from '$features/personnel/contexts/PersonnelPageContext.svelte';
	import type { Personnel } from '../personnel.types';
	import { SvelteSet } from 'svelte/reactivity';
	import { onDestroy, tick } from 'svelte';
	import { toastStore } from '$lib/stores/toast.svelte';
	import PersonnelGroupHeader from './roster/PersonnelGroupHeader.svelte';
	import PersonnelRosterHeader from './roster/PersonnelRosterHeader.svelte';
	import PersonnelRosterRow from './roster/PersonnelRosterRow.svelte';
	import { personnelToolbarItems } from './roster/personnelToolbarItems';
	import { RosterQuickEdit } from './roster/quickEdit.svelte';
	import type { RosterRowControls } from './roster/rosterRow';

	interface Props {
		ctx: PersonnelPageContext;
	}

	let { ctx }: Props = $props();
	const orgUrlSegment = $derived(ctx.orgUrlSegment ?? ctx.orgId);
	let active = true;
	onDestroy(() => {
		active = false;
	});

	const ROSTER_PAGE_SIZE = 75;
	const GROUPED_ROSTER_RENDER_LIMIT = 250;
	const canViewRoster = $derived(ctx.canViewRoster);
	const canAddPersonnel = $derived(ctx.canAddPersonnel);
	let locallyArchivedIds = new SvelteSet<string>();
	const visibleAllActivePersonnel = $derived(
		ctx.allActivePersonnel.filter((person) => !locallyArchivedIds.has(person.id))
	);
	const visibleAlphabeticalPersonnel = $derived(
		ctx.alphabeticalPersonnel.filter((person) => !locallyArchivedIds.has(person.id))
	);
	const visibleFilteredPersonnel = $derived(
		ctx.filteredPersonnel.filter((person) => !locallyArchivedIds.has(person.id))
	);
	const canBulkArchivePersonnel = $derived(
		visibleAllActivePersonnel.some((person) => ctx.canArchivePersonnelRecord(person))
	);

	$effect(() => {
		const ids = visibleAllActivePersonnel.map((person) => person.id);
		if (ctx.signals.status === 'ready') ctx.signals.ensure(ids);
	});

	const personnelColumns = $derived.by<ColumnDef<Personnel>[]>(() => {
		const columns: ColumnDef<Personnel>[] = [
			{
				key: 'status',
				header: '',
				headerAriaLabel: 'Status today',
				value: () => '',
				searchable: false,
				sortable: false,
				width: '28px'
			},
			{ key: 'rank', header: 'Rank', value: (p) => p.rank, width: '64px', hiddenBelow: '@3xl' },
			{
				key: 'name',
				header: 'Name',
				value: (p) => `${p.lastName}, ${p.firstName}`,
				compare: (a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName)
			},
			{ key: 'mos', header: 'MOS', value: (p) => p.mos, width: '72px', hiddenBelow: '@3xl' },
			{ key: 'role', header: 'Duty Role', value: (p) => p.clinicRole, hiddenBelow: '@3xl' },
			{ key: 'group', header: 'Group', value: (p) => p.groupName, hiddenBelow: '@3xl' },
			{
				key: 'attention',
				header: 'Needs attention',
				value: () => '',
				searchable: false,
				sortable: false,
				// Fixed, so the columns hold still when the lane's text replaces the skeleton.
				width: 'min(22rem, 35cqw)',
				hiddenBelow: '@xl'
			},
			{
				key: 'actions',
				header: '',
				headerAriaLabel: 'Actions',
				value: () => '',
				searchable: false,
				sortable: false,
				width: '112px',
				hiddenBelow: 'md'
			}
		];
		if (bulkArchiveMode) {
			columns.unshift({ key: 'select', header: '', value: () => '', searchable: false, sortable: false });
		}
		return columns;
	});

	const azTable = useDataTable<Personnel>({
		data: () => holdOrder(visibleAlphabeticalPersonnel, 'az'),
		columns: () => personnelColumns,
		initialSortKey: 'name',
		initialSortDirection: 'asc',
		pageSize: ROSTER_PAGE_SIZE
	});

	const groupedTable = useDataTable<Personnel>({
		data: () => holdOrder(visibleFilteredPersonnel, 'grouped'),
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

	// A quick-edit save keeps the rows' order going in, so a row whose active sort value did not change stays put.
	let heldOrders = $state.raw<Record<'az' | 'grouped', Map<string, number>> | null>(null);

	function holdOrder(rows: Personnel[], table: 'az' | 'grouped'): Personnel[] {
		const order = heldOrders?.[table];
		if (!order) return rows;
		const place = (person: Personnel) => order.get(person.id) ?? Number.MAX_SAFE_INTEGER;
		return [...rows].sort((a, b) => place(a) - place(b));
	}

	function holdCurrentOrder() {
		const places = (rows: Personnel[]) => new Map(rows.map((person, index) => [person.id, index]));
		heldOrders = {
			az: places(holdOrder(visibleAlphabeticalPersonnel, 'az')),
			grouped: places(holdOrder(visibleFilteredPersonnel, 'grouped'))
		};
	}

	// Sorting, searching or switching the view is the user choosing the order, so the held one lapses.
	$effect(() => {
		void [
			azTable.sortKey,
			azTable.sortDirection,
			azTable.search,
			groupedTable.sortKey,
			groupedTable.sortDirection,
			groupedTable.search,
			ctx.viewMode
		];
		heldOrders = null;
	});

	let rosterSearch = $state('');
	let bulkArchiveMode = $state(false);
	let bulkArchiveSubmitting = $state(false);
	let showBulkArchiveConfirm = $state(false);
	let selectedArchiveIds = new SvelteSet<string>();
	let focusedRowId = $state<string | null>(null);
	const shouldGateGroupedRoster = $derived(
		ctx.viewMode === 'by-group' && !rosterSearch.trim() && groupedTable.totalRows > GROUPED_ROSTER_RENDER_LIMIT
	);
	const activeTable = $derived(ctx.viewMode === 'alphabetical' ? azTable : groupedTable);
	const shownRows = $derived(
		activeTable.groups.length > 0
			? activeTable.groups.flatMap((group) => (group.collapsed ? [] : group.rows))
			: activeTable.rows
	);
	const quickEdit = new RosterQuickEdit({
		person: (id) => ctx.getPersonnelById(id),
		groups: () => groupManagementStore.items,
		save: (id, data) => {
			holdCurrentOrder();
			return personnelStore.updateOrThrow(id, data);
		},
		refreshSignals: (ids) => void ctx.signals.refresh(ids),
		dataSheetHref: (person) => `${recordHref(person)}/data-sheet`,
		navigate: (href) => void goto(href),
		closed: (id) => void restoreRowFocus(id)
	});
	$effect(() => quickEdit.closeIfGone());
	$effect(() => () => quickEdit.dispose());
	const rowControls: RosterRowControls = {
		get selecting() {
			return bulkArchiveMode;
		},
		get selectionBusy() {
			return bulkArchiveSubmitting;
		},
		isSelected: (id) => selectedArchiveIds.has(id),
		toggleSelected: toggleArchiveSelection,
		get tabRowId() {
			return shownRows.some((person) => person.id === focusedRowId) ? focusedRowId : (shownRows[0]?.id ?? null);
		},
		focused: (id) => (focusedRowId = id),
		recordHref,
		openRecord: (person) => void goto(recordHref(person)),
		note: (person) => void goto(`${recordHref(person)}/log?add=follow-up`),
		edit: quickEdit
	};
	const canNoteAny = $derived(shownRows.some((p) => ctx.canOpenPersonnelDetail(p)));
	const canQuickEditAny = $derived(shownRows.some((p) => ctx.canManagePersonnelRecord(p)));

	function recordHref(person: Personnel): string {
		return resolve(`/org/${orgUrlSegment}/personnel/${person.slug ?? person.id}`);
	}

	// The closed editor takes its focus with it; put it back on the row unless focus moved elsewhere.
	async function restoreRowFocus(personnelId: string) {
		await tick();
		if (document.activeElement && document.activeElement !== document.body) return;
		document.querySelector<HTMLElement>(`[data-roster-row="${CSS.escape(personnelId)}"]`)?.focus();
	}

	// Pinning reorders the groups and the moved header drops focus; put it back on the pin unless focus moved elsewhere.
	async function togglePin(groupKey: string) {
		const restoreFocus = async () => {
			await tick();
			if (document.activeElement && document.activeElement !== document.body) return;
			document.querySelector<HTMLElement>(`[data-pin-group="${CSS.escape(groupKey)}"]`)?.focus();
		};
		const saved = pinnedGroupsStore.toggle(groupKey);
		await restoreFocus();
		await saved;
		await restoreFocus();
	}

	function setRosterSearch(value: string): void {
		rosterSearch = value;
		ctx.searchQuery = value;
	}

	function toggleArchiveMode(): void {
		if (bulkArchiveSubmitting) return;
		bulkArchiveMode = !bulkArchiveMode;
		selectedArchiveIds.clear();
	}

	function cancelArchiveMode(): void {
		if (bulkArchiveSubmitting) return;
		bulkArchiveMode = false;
		selectedArchiveIds.clear();
		showBulkArchiveConfirm = false;
	}

	function toggleArchiveSelection(id: string): void {
		if (bulkArchiveSubmitting) return;
		const person = ctx.getPersonnelById(id);
		if (!person || !ctx.canArchivePersonnelRecord(person)) return;

		if (selectedArchiveIds.has(id)) {
			selectedArchiveIds.delete(id);
		} else {
			selectedArchiveIds.add(id);
		}
	}

	function selectVisibleArchiveRows(): void {
		if (bulkArchiveSubmitting) return;
		for (const person of activeTable.rows) {
			if (ctx.canArchivePersonnelRecord(person)) selectedArchiveIds.add(person.id);
		}
	}

	function clearArchiveSelection(): void {
		if (bulkArchiveSubmitting) return;
		selectedArchiveIds.clear();
	}

	async function confirmBulkArchive(): Promise<void> {
		const orgId = ctx.orgId;
		const ids = [...selectedArchiveIds];
		if (ids.length === 0 || bulkArchiveSubmitting || !active) return;
		const isCurrent = () => active && ctx.orgId === orgId;
		bulkArchiveSubmitting = true;
		try {
			const { bulkArchivePersonnel } = await import('$features/personnel/utils/bulkArchivePersonnel');
			if (!isCurrent()) return;
			const result = await bulkArchivePersonnel(orgId, ids);
			if (!isCurrent()) return;

			for (const id of result.archivedIds) {
				locallyArchivedIds.add(id);
				personnelStore.removeLocal(id);
				selectedArchiveIds.delete(id);
			}
			for (const id of result.approvalRequestedIds) selectedArchiveIds.delete(id);
			showBulkArchiveConfirm = false;
			bulkArchiveMode = selectedArchiveIds.size > 0;

			if (result.archivedIds.length > 0) toastStore.success(`${result.archivedIds.length} personnel archived`);
			if (result.approvalRequestedIds.length > 0) {
				toastStore.info(`${result.approvalRequestedIds.length} archival requests submitted for admin approval.`);
			}
			if (result.errors.length > 0) {
				toastStore.error(`${result.errors.length} personnel could not be archived. Retry the selected personnel.`);
			}
			if (result.archivedIds.length > 0 || result.approvalRequestedIds.length > 0) {
				try {
					await invalidate('app:personnel-data');
				} catch {
					if (isCurrent())
						toastStore.warning(
							'Archive results were saved, but the roster could not be refreshed. Refresh to check the latest roster.'
						);
				}
			}
		} catch {
			if (isCurrent()) {
				showBulkArchiveConfirm = false;
				toastStore.error(
					'Archive results could not be confirmed. Refresh to check the roster, then retry the selected personnel if needed.'
				);
			}
		} finally {
			if (isCurrent()) bulkArchiveSubmitting = false;
		}
	}

	const toolbarItems = $derived(
		personnelToolbarItems({
			viewMode: ctx.viewMode,
			onViewModeChange: (mode) => (ctx.viewMode = mode),
			onManageGroups: ctx.canManageGroups ? () => ctx.openGroupManager() : null,
			importHref: ctx.canImportPersonnel ? `/org/${orgUrlSegment}/personnel/import` : null,
			archive: canBulkArchivePersonnel ? { onToggle: toggleArchiveMode, busy: bulkArchiveSubmitting } : null
		})
	);

	const toolbarSearch = $derived({
		label: 'Search by name, rank, MOS, role, or group',
		placeholder: 'Search name, rank, MOS, role, or group...',
		value: rosterSearch,
		onValueChange: setRosterSearch
	} satisfies NonNullable<WorkspaceToolbarProps['search']>);

	const toolbarPrimary = $derived.by<WorkspaceToolbarProps['primary']>(() =>
		canAddPersonnel
			? { kind: 'action', id: 'add-person', label: 'Add Person', onclick: () => ctx.handleAdd() }
			: undefined
	);

	const bulkArchiveItems = $derived.by<ToolbarItem[]>(() => {
		const items: ToolbarItem[] = [
			{ kind: 'action', id: 'cancel', label: 'Cancel', onclick: cancelArchiveMode, disabled: bulkArchiveSubmitting }
		];
		if (visibleAllActivePersonnel.length > 0) {
			if (!shouldGateGroupedRoster) {
				items.push({
					kind: 'action',
					id: 'select-shown',
					label: 'Select shown',
					onclick: selectVisibleArchiveRows,
					disabled: bulkArchiveSubmitting
				});
			}
			items.push({
				kind: 'action',
				id: 'clear',
				label: 'Clear',
				onclick: clearArchiveSelection,
				disabled: bulkArchiveSubmitting
			});
		}
		return items;
	});

	const bulkArchivePrimary = $derived<WorkspaceToolbarProps['primary']>({
		kind: 'action',
		id: 'confirm-archive',
		label: 'Confirm Archive',
		destructive: true,
		onclick: () => (showBulkArchiveConfirm = true),
		disabled: selectedArchiveIds.size === 0 || bulkArchiveSubmitting
	});
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
		<div class="flex min-h-0 flex-col gap-4 overflow-hidden px-6 pt-4 pb-5 max-sm:p-3">
			<PersonnelRosterHeader
				unitName={ctx.orgName}
				activeCount={visibleAllActivePersonnel.length}
				summary={ctx.summarizeSignals(visibleAllActivePersonnel)}
				canViewAvailability={ctx.canViewAvailability}
			/>

			<WorkspaceToolbar
				ariaLabel="Personnel controls"
				items={toolbarItems}
				search={toolbarSearch}
				primary={toolbarPrimary}
			/>

			{#if ctx.signals.status === 'failed'}
				<Alert.Root role="status">
					<Alert.Description>Today's status and Needs attention could not be loaded.</Alert.Description>
					<Alert.Action>
						<Button type="button" variant="outline" size="xs" onclick={() => ctx.signals.reload()}>Reload</Button>
					</Alert.Action>
				</Alert.Root>
			{/if}

			{#if ctx.lossWarningsUnavailable}
				<Alert.Root role="status">
					<Alert.Description>Loss warnings could not be loaded, so ETS and PCS flags are not shown.</Alert.Description>
					<Alert.Action>
						<Button type="button" variant="outline" size="xs" onclick={() => window.location.reload()}
							>Reload page</Button
						>
					</Alert.Action>
				</Alert.Root>
			{/if}

			{#if bulkArchiveMode}
				<div class="grid gap-2">
					<p class="text-sm text-muted-foreground" aria-live="polite">
						{visibleAllActivePersonnel.length === 0
							? `${selectedArchiveIds.size} selected for retry`
							: `${selectedArchiveIds.size} of ${activeTable.totalRows} selected`}
					</p>
					<WorkspaceToolbar ariaLabel="Bulk archive controls" items={bulkArchiveItems} primary={bulkArchivePrimary} />
				</div>
			{/if}

			{#if visibleAllActivePersonnel.length === 0}
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
							<Button onclick={() => ctx.handleAdd()}>Add Person</Button>
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
					<div class="min-w-[min(100%,300px)] flex-[0_1_420px] max-sm:flex-auto">
						<WorkspaceToolbar
							ariaLabel="Grouped roster controls"
							items={[]}
							search={{
								label: 'Search by name, rank, MOS, role, or group',
								placeholder: 'Search roster...',
								value: rosterSearch,
								onValueChange: setRosterSearch
							}}
							primary={{
								kind: 'action',
								id: 'use-az-view',
								label: 'Use A-Z View',
								onclick: () => (ctx.viewMode = 'alphabetical')
							}}
						/>
					</div>
				</div>
			{:else}
				<div
					class="flex min-h-0 min-w-0 flex-1 [&_[data-slot='data-table']]:min-h-0 [&_[data-slot='data-table']]:w-full [&_[data-slot='data-table']]:flex-1"
				>
					<DataTable.DataTable
						table={activeTable}
						columns={personnelColumns}
						ariaLabel="Personnel roster"
						emptyMessage="No personnel match your search."
						emptyLevel={2}
						maxHeight="100%"
					>
						{#snippet row(person, columns)}
							<PersonnelRosterRow {person} {columns} {ctx} controls={rowControls} />
						{/snippet}
						{#snippet groupHeader(group)}
							<PersonnelGroupHeader
								{group}
								pinned={pinnedGroupsStore.list.includes(group.key)}
								onTogglePin={togglePin}
							/>
						{/snippet}
					</DataTable.DataTable>
				</div>
				<div class="flex items-center justify-between gap-4 font-mono text-xs text-muted-foreground">
					<span aria-live="polite">{activeTable.totalRows} of {visibleAllActivePersonnel.length} shown</span>
					<span class="flex gap-4 max-md:hidden" aria-hidden="true">
						{#if canNoteAny}<span>N note</span>{/if}
						{#if canQuickEditAny}<span>E quick edit</span>{/if}
						{#if ctx.canReadPersonnelDetails}<span>↵ open record</span>{/if}
					</span>
				</div>
			{/if}
		</div>
	{/if}
</div>

{#if showBulkArchiveConfirm}
	{#await import('$lib/components/ui/confirm-dialog') then { ConfirmDialog }}
		<ConfirmDialog
			title="Archive Personnel"
			message="Archive {selectedArchiveIds.size} personnel? They will leave active rosters, calendars, and reports. Records are not erased, and some archives may require approval."
			confirmLabel="Archive"
			variant="default"
			loading={bulkArchiveSubmitting}
			onConfirm={confirmBulkArchive}
			onCancel={() => (showBulkArchiveConfirm = false)}
		/>
	{/await}
{/if}

{#if quickEdit.prompt}
	{#await import('./roster/PersonnelQuickEditPrompt.svelte') then { default: QuickEditPrompt }}
		<QuickEditPrompt edit={quickEdit} />
	{/await}
{/if}
