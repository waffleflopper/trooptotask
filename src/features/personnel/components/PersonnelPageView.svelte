<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { personnelStore } from '$features/personnel/stores/personnel.svelte';
	import { pinnedGroupsStore } from '../stores/pinnedGroups.svelte';
	import { groupsStore } from '../stores/groups.svelte';
	import UsersIcon from '@lucide/svelte/icons/users';
	import * as Alert from '$lib/components/ui/alert';
	import { Button } from '$lib/components/ui/button';
	import * as DataTable from '$lib/components/ui/data-table';
	import * as Empty from '$lib/components/ui/empty/index.js';
	import { useDataTable } from '$lib/components/ui/data-table';
	import type { ColumnDef } from '$lib/components/ui/data-table';
	import { WorkspaceToolbar, type WorkspaceToolbarProps } from '$lib/components/patterns/workspace-toolbar';
	import type { PersonnelPageContext } from '$features/personnel/contexts/PersonnelPageContext.svelte';
	import type { Personnel } from '../personnel.types';
	import { compareRosterGroupNames } from '../rosterReadModel';
	import { SvelteSet } from 'svelte/reactivity';
	import { onDestroy, tick } from 'svelte';
	import type { ComposerKind } from '../rosterComposer';
	import PersonnelBulkBar from './roster/PersonnelBulkBar.svelte';
	import PersonnelGroupHeader from './roster/PersonnelGroupHeader.svelte';
	import PersonnelRosterHeader from './roster/PersonnelRosterHeader.svelte';
	import PersonnelRosterRow from './roster/PersonnelRosterRow.svelte';
	import RosterBulkComposer from './roster/RosterBulkComposer.svelte';
	import RosterNotePopover from './roster/RosterNotePopover.svelte';
	import { personnelToolbarItems } from './roster/personnelToolbarItems';
	import type { RosterRowControls } from './roster/rosterRow';
	import { RosterSelection } from './roster/rosterSelection.svelte';

	interface Props {
		ctx: PersonnelPageContext;
	}

	let { ctx }: Props = $props();
	const orgUrlSegment = $derived(ctx.orgUrlSegment ?? ctx.orgId);

	const ROSTER_PAGE_SIZE = 75;
	const GROUPED_ROSTER_RENDER_LIMIT = 250;
	// A NUL cannot appear in a saved Group name, so a Group named "Unassigned" never collides with the no-Group bucket.
	const NO_GROUP = '\u0000';
	const groupKey = (person: Personnel): string => person.groupName || NO_GROUP;
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
	// Every bulk action needs Manage records, Export or Archive on someone; without them there is nothing to select for.
	const canSelect = $derived(
		visibleAllActivePersonnel.some(
			(p) => ctx.canManagePersonnelRecord(p) || ctx.canExportPersonnelRecord(p) || ctx.canArchivePersonnelRecord(p)
		)
	);
	const selection = new RosterSelection();
	let active = true;
	onDestroy(() => {
		active = false;
	});
	const selectedPeople = $derived(visibleAllActivePersonnel.filter((person) => selection.has(person.id)));
	const hiddenSelected = $derived.by(() => {
		const shown = new Set(visibleFilteredPersonnel.map((person) => person.id));
		return selectedPeople.filter((person) => !shown.has(person.id)).length;
	});

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
		if (canSelect) {
			columns.unshift({
				key: 'select',
				header: '',
				headerAriaLabel: 'Select',
				value: () => '',
				searchable: false,
				sortable: false,
				width: '36px'
			});
		}
		return columns;
	});

	// The Group header already names the Group, so By Group view drops the column.
	const groupedColumns = $derived(personnelColumns.filter((column) => column.key !== 'group'));

	const azTable = useDataTable<Personnel>({
		data: () => visibleAlphabeticalPersonnel,
		columns: () => personnelColumns,
		initialSortKey: 'name',
		initialSortDirection: 'asc',
		pageSize: ROSTER_PAGE_SIZE
	});

	const groupComparator = $derived(
		compareRosterGroupNames({ pinnedGroups: pinnedGroupsStore.list, groupOrder: ctx.groupOrder })
	);
	const groupedTable = useDataTable<Personnel>({
		data: () => visibleFilteredPersonnel,
		columns: () => groupedColumns,
		initialSortKey: 'name',
		initialSortDirection: 'asc',
		groupBy: {
			key: groupKey,
			label: (key) => (key === NO_GROUP ? 'Unassigned' : key),
			compare: (a, b) => groupComparator(a === NO_GROUP ? '' : a, b === NO_GROUP ? '' : b)
		}
	});
	const peopleByGroup = $derived(Map.groupBy(visibleFilteredPersonnel, groupKey));

	let rosterSearch = $state('');
	let focusedRowId = $state<string | null>(null);
	let notePerson = $state<Personnel | null>(null);
	let noteComposer = $state<RosterNotePopover>();
	let bulkCompose = $state<{
		kind: ComposerKind;
		personnelIds: string[];
		skipped: number;
		heading: string;
		anchor: string;
	} | null>(null);
	let bulkComposer = $state<RosterBulkComposer>();
	const shouldGateGroupedRoster = $derived(
		ctx.viewMode === 'by-group' && !rosterSearch.trim() && groupedTable.totalRows > GROUPED_ROSTER_RENDER_LIMIT
	);
	const activeTable = $derived(ctx.viewMode === 'alphabetical' ? azTable : groupedTable);
	const shownRows = $derived(
		activeTable.groups.length > 0
			? activeTable.groups.flatMap((group) => (group.collapsed ? [] : group.rows))
			: activeTable.rows
	);
	const shownIds = $derived(shownRows.map((person) => person.id));
	const rowControls: RosterRowControls = {
		get selectable() {
			return canSelect;
		},
		isSelected: (id) => selection.has(id),
		select: (id, selected, range) => selection.set(id, selected, range ? shownIds : undefined),
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
		quickEdit: (person) => ctx.handleEdit(person)
	};
	const canNoteAny = $derived(shownRows.some((p) => ctx.canManagePersonnelRecord(p)));
	const canQuickEditAny = $derived(shownRows.some((p) => ctx.canManagePersonnelRecord(p)));

	// One composer at a time: opening another asks the open one to close (and to discard typed text) first, then opens.
	function replaceComposer(open: () => void): void {
		const composer = notePerson ? noteComposer : bulkCompose ? bulkComposer : undefined;
		if (composer) composer.requestClose(open);
		else open();
	}

	function openNote(person: Personnel): void {
		if (notePerson?.id === person.id) noteComposer?.requestClose();
		else replaceComposer(() => (notePerson = person));
	}

	const peopleCount = (n: number) => `${n} ${n === 1 ? 'person' : 'people'}`;

	function openBulkCompose(people: readonly Personnel[], kind: ComposerKind, heading: string, anchor: string): void {
		const writable = people.filter((person) => ctx.canManagePersonnelRecord(person));
		replaceComposer(
			() =>
				(bulkCompose = {
					kind,
					personnelIds: writable.map((person) => person.id),
					skipped: people.length - writable.length,
					heading: heading.replace('{count}', peopleCount(writable.length)),
					anchor
				})
		);
	}

	function composeForSelection(kind: ComposerKind): void {
		openBulkCompose(selectedPeople, kind, '{count}', '[data-roster-bulk-bar]');
	}

	function noteToGroup(key: string, label: string): void {
		const members = visibleAllActivePersonnel.filter((person) => groupKey(person) === key);
		openBulkCompose(members, 'note', `${label} · {count}`, `[data-roster-group="${CSS.escape(key)}"]`);
	}

	function handleRosterKeydown(event: KeyboardEvent): void {
		if (event.key !== 'Escape' || event.defaultPrevented || selection.size === 0 || bulkCompose) return;
		selection.clear();
	}

	function handleArchived(result: { archivedIds: string[]; approvalRequestedIds: string[] }): void {
		for (const id of result.archivedIds) {
			locallyArchivedIds.add(id);
			personnelStore.removeLocal(id);
		}
		selection.remove([...result.archivedIds, ...result.approvalRequestedIds]);
	}

	async function closeNote(): Promise<void> {
		const id = notePerson?.id;
		notePerson = null;
		await tick();
		if (!id || (document.activeElement && document.activeElement !== document.body)) return;
		document.querySelector<HTMLElement>(`[data-roster-row="${CSS.escape(id)}"]`)?.focus();
	}

	// A refresh hands over a new context for the same Organization; only a new Organization starts over.
	const orgId = $derived(ctx.orgId);
	$effect(() => {
		void orgId;
		notePerson = null;
		bulkCompose = null;
		selection.clear();
	});

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

	const toolbarItems = $derived(
		personnelToolbarItems({
			viewMode: ctx.viewMode,
			onViewModeChange: (mode) => (ctx.viewMode = mode),
			onManageGroups: ctx.canManageGroups ? () => ctx.openGroupEditor(groupsStore.items[0]?.id ?? null) : null,
			importHref: ctx.canImportPersonnel ? `/org/${orgUrlSegment}/personnel/import` : null
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
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="@container/roster flex min-h-0 flex-col gap-4 overflow-clip px-6 pt-4 pb-5 max-sm:p-3"
			onkeydown={handleRosterKeydown}
		>
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
						columns={ctx.viewMode === 'by-group' ? groupedColumns : personnelColumns}
						ariaLabel="Personnel roster"
						emptyMessage="No personnel match your search."
						emptyLevel={2}
						maxHeight="100%"
					>
						{#snippet headerCell(column)}
							{#if column.key === 'select'}
								{@const state = selection.state(shownIds)}
								<span class="inline-flex h-8 items-center">
									<DataTable.SelectionCheckbox
										checked={state === 'all'}
										indeterminate={state === 'some'}
										disabled={shownIds.length === 0}
										ariaLabel="Select everyone shown"
										onCheckedChange={(selected) => selection.setAll(shownIds, selected)}
									/>
								</span>
							{:else if column.sortable !== false}
								<DataTable.SortableHeader table={activeTable} {column} />
							{:else}
								<span aria-label={column.headerAriaLabel} class="inline-flex h-8 items-center">{column.header}</span>
							{/if}
						{/snippet}
						{#snippet row(person, columns)}
							<PersonnelRosterRow {person} {columns} {ctx} controls={rowControls} />
						{/snippet}
						{#snippet groupHeader(group)}
							{@const people = peopleByGroup.get(group.key) ?? []}
							{@const ids = people.map((person) => person.id)}
							{@const unassigned = group.key === NO_GROUP}
							{@const groupId = unassigned ? null : ctx.groupIdForName(group.key)}
							<PersonnelGroupHeader
								{group}
								{people}
								{ctx}
								pinned={pinnedGroupsStore.list.includes(group.key)}
								{unassigned}
								onTogglePin={togglePin}
								selection={canSelect
									? { state: selection.state(ids), set: (selected) => selection.setAll(ids, selected) }
									: null}
								onNoteToEveryone={!unassigned && groupId && ctx.canManagePersonnelInGroup(groupId)
									? () => noteToGroup(group.key, group.label)
									: null}
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
			{#if selectedPeople.length > 0}
				<!-- In the flow, so the end of the roster leaves room for it; clip, not hidden, above keeps it sticky. -->
				<div class="pointer-events-none sticky bottom-4 z-20 flex justify-center max-sm:bottom-3">
					<div class="pointer-events-auto max-w-full">
						<PersonnelBulkBar
							{ctx}
							people={selectedPeople}
							hidden={hiddenSelected}
							oncompose={composeForSelection}
							onclear={() => selection.clear()}
							onarchived={handleArchived}
							isCurrent={(startedFor) => active && orgId === startedFor}
						/>
					</div>
				</div>
			{/if}
		</div>
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

{#if bulkCompose}
	{#key bulkCompose}
		<RosterBulkComposer
			bind:this={bulkComposer}
			{ctx}
			personnelIds={bulkCompose.personnelIds}
			skipped={bulkCompose.skipped}
			heading={bulkCompose.heading}
			anchor={bulkCompose.anchor}
			initialKind={bulkCompose.kind}
			onclose={() => (bulkCompose = null)}
		/>
	{/key}
{/if}
