<script lang="ts">
	import { goto, invalidate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { personnelStore } from '$features/personnel/stores/personnel.svelte';
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
	import { MediaQuery, SvelteSet } from 'svelte/reactivity';
	import { onDestroy, tick, untrack, type Snippet } from 'svelte';
	import { toastStore } from '$lib/stores/toast.svelte';
	import PersonnelGroupHeader from './roster/PersonnelGroupHeader.svelte';
	import PersonnelRosterHeader from './roster/PersonnelRosterHeader.svelte';
	import PersonnelRosterRow from './roster/PersonnelRosterRow.svelte';
	import RosterNotePopover from './roster/RosterNotePopover.svelte';
	import RosterPeekPanel from './roster/RosterPeekPanel.svelte';
	import { personnelToolbarItems } from './roster/personnelToolbarItems';
	import type { RosterRowControls } from './roster/rosterRow';

	interface Props {
		ctx: PersonnelPageContext;
		/** The peek panel's 7-day Calendar strip, drawn by the route because Calendar builds on Personnel. */
		nextDays?: Snippet<[calendar: unknown]>;
	}

	let { ctx, nextDays }: Props = $props();
	const orgUrlSegment = $derived(ctx.orgUrlSegment ?? ctx.orgId);
	let active = true;
	onDestroy(() => {
		active = false;
	});

	const ROSTER_PAGE_SIZE = 75;
	// Below this the roster beside a 470 px panel is too narrow, so a row click opens the record instead.
	const peekFits = new MediaQuery('min-width: 1280px', false);
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
			...(peekOpen
				? []
				: ([
						{ key: 'role', header: 'Duty Role', value: (p) => p.clinicRole, hiddenBelow: '@3xl' },
						{ key: 'group', header: 'Group', value: (p) => p.groupName, hiddenBelow: '@3xl' }
					] satisfies ColumnDef<Personnel>[])),
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
				width: peekOpen ? '40px' : '112px',
				hiddenBelow: 'md'
			}
		];
		if (bulkArchiveMode) {
			columns.unshift({ key: 'select', header: '', value: () => '', searchable: false, sortable: false });
		}
		return columns;
	});

	const azTable = useDataTable<Personnel>({
		data: () => visibleAlphabeticalPersonnel,
		columns: () => personnelColumns,
		initialSortKey: 'name',
		initialSortDirection: 'asc',
		pageSize: ROSTER_PAGE_SIZE
	});

	const groupedTable = useDataTable<Personnel>({
		data: () => visibleFilteredPersonnel,
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
	let bulkArchiveMode = $state(false);
	let bulkArchiveSubmitting = $state(false);
	let showBulkArchiveConfirm = $state(false);
	let selectedArchiveIds = new SvelteSet<string>();
	let focusedRowId = $state<string | null>(null);
	let notePerson = $state<Personnel | null>(null);
	let noteComposer = $state<RosterNotePopover>();
	let peekedId = $state<string | null>(null);
	let peekBrowsing = $state(false);
	let peekPanel = $state<RosterPeekPanel>();
	const peekedPerson = $derived(
		peekedId && !locallyArchivedIds.has(peekedId) ? (ctx.getPersonnelById(peekedId) ?? null) : null
	);
	const peekOpen = $derived(peekFits.current && canViewRoster && peekedPerson !== null);
	const shouldGateGroupedRoster = $derived(
		ctx.viewMode === 'by-group' && !rosterSearch.trim() && groupedTable.totalRows > GROUPED_ROSTER_RENDER_LIMIT
	);
	const activeTable = $derived(ctx.viewMode === 'alphabetical' ? azTable : groupedTable);
	const shownRows = $derived(
		activeTable.groups.length > 0
			? activeTable.groups.flatMap((group) => (group.collapsed ? [] : group.rows))
			: activeTable.rows
	);
	// J/K walks every A-Z page, turning the page as it goes; the grouped view skips collapsed Groups.
	const peekSequence = $derived(ctx.viewMode === 'alphabetical' ? azTable.allRows : shownRows);
	const peekPosition = $derived({
		index: peekSequence.findIndex((person) => person.id === peekedId),
		total: peekSequence.length
	});
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
		get noteOpenFor() {
			return notePerson?.id ?? null;
		},
		note: openNote,
		quickEdit: (person) => ctx.handleEdit(person),
		get peekedId() {
			return peekOpen ? peekedId : null;
		},
		peek(person) {
			if (!peekFits.current || !ctx.canOpenPersonnelDetail(person)) return false;
			showPeek(person, false);
			return true;
		},
		peekKey(event) {
			if (!peekOpen) return false;
			const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
			if (key === 'j' || key === 'k') stepPeek(key === 'j' ? 1 : -1, true);
			else if (key === 'Escape') closePeek();
			else if (key === 'Tab' && !event.shiftKey) peekPanel?.focusFirst();
			else return false;
			return true;
		}
	};
	const canNoteAny = $derived(shownRows.some((p) => ctx.canManagePersonnelRecord(p)));
	const canQuickEditAny = $derived(shownRows.some((p) => ctx.canManagePersonnelRecord(p)));

	// One composer at a time: a second Note asks the open one to close (and to discard typed text) first.
	function openNote(person: Personnel): void {
		if (notePerson) {
			const sameRow = notePerson.id === person.id;
			const closed = noteComposer?.requestClose() ?? true;
			if (sameRow || !closed) return;
		}
		notePerson = person;
	}

	async function closeNote(): Promise<void> {
		const id = notePerson?.id;
		notePerson = null;
		await tick();
		if (!id || (document.activeElement && document.activeElement !== document.body)) return;
		document.querySelector<HTMLElement>(`[data-roster-row="${CSS.escape(id)}"]`)?.focus();
	}

	$effect(() => {
		void ctx.orgId;
		notePerson = null;
		peekedId = null;
	});

	// Showing the same Person again reads nothing unless their record changed, so store updates are cheap here.
	$effect(() => {
		const peek = ctx.peek;
		const person = peekOpen ? peekedPerson : null;
		const browsing = peekBrowsing;
		untrack(() => (person ? peek.show(person, { browsing }) : peek.close()));
	});

	$effect(() => {
		const peek = ctx.peek;
		return () => peek.close();
	});

	async function focusRow(id: string): Promise<void> {
		await tick();
		document.querySelector<HTMLElement>(`[data-roster-row="${CSS.escape(id)}"]`)?.focus();
	}

	/** A typed draft in the panel's composer asks to be discarded before the panel shows someone else or closes. */
	function showPeek(person: Personnel, browsing: boolean, then?: () => void): void {
		const show = () => {
			peekedId = person.id;
			peekBrowsing = browsing;
			then?.();
		};
		if (peekPanel && peekedId !== person.id) peekPanel.release(show);
		else show();
	}

	function stepPeek(step: 1 | -1, moveFocus: boolean): void {
		const sequence = peekSequence;
		const from = sequence.findIndex((person) => person.id === peekedId);
		for (let index = from + step; index >= 0 && index < sequence.length; index += step) {
			const next = sequence[index];
			if (!ctx.canOpenPersonnelDetail(next)) continue;
			showPeek(next, true, () => {
				if (ctx.viewMode === 'alphabetical') azTable.setPage(Math.floor(index / ROSTER_PAGE_SIZE) + 1);
				if (moveFocus) void focusRow(next.id);
			});
			return;
		}
	}

	function closePeek(): void {
		const id = peekedId;
		if (!id) return;
		const close = () => {
			peekedId = null;
			void focusRow(id);
		};
		if (peekPanel) peekPanel.release(close);
		else close();
	}

	function recordHref(person: Personnel): string {
		return resolve(`/org/${orgUrlSegment}/personnel/${person.slug ?? person.id}`);
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

<div class="flex h-full min-h-0 overflow-hidden bg-background">
	{#if !canViewRoster}
		<div
			class="m-6 flex min-h-80 flex-1 flex-col items-center justify-center rounded-lg border bg-card p-8 text-center text-muted-foreground"
		>
			<h2 class="mb-2 text-2xl font-semibold tracking-tight text-foreground">Access Restricted</h2>
			<p class="m-0 max-w-prose leading-relaxed">
				You don't have permission to view this area. Contact your organization admin for access.
			</p>
		</div>
	{:else}
		<!-- Content height, capped at the page, so the footer follows a short roster; the peek panel beside it is full height. -->
		<div
			class="flex max-h-full min-h-0 min-w-0 flex-1 flex-col gap-4 self-start overflow-hidden px-6 pt-4 pb-5 max-sm:p-3"
		>
			<PersonnelRosterHeader
				unitName={ctx.orgName}
				activeCount={visibleAllActivePersonnel.length}
				summary={ctx.summarizeSignals(visibleAllActivePersonnel)}
				canViewAvailability={ctx.canViewAvailability && !peekOpen}
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
		{#if peekOpen && peekedPerson}
			<RosterPeekPanel
				bind:this={peekPanel}
				{ctx}
				person={peekedPerson}
				recordHref={recordHref(peekedPerson)}
				position={peekPosition}
				onstep={(step) => stepPeek(step, false)}
				onclose={closePeek}
				onquickedit={rowControls.quickEdit}
				{nextDays}
			/>
		{/if}
	{/if}
</div>

{#if notePerson}
	{#key notePerson.id}
		<RosterNotePopover
			bind:this={noteComposer}
			{ctx}
			person={notePerson}
			recordHref={recordHref(notePerson)}
			onclose={closeNote}
		/>
	{/key}
{/if}

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
