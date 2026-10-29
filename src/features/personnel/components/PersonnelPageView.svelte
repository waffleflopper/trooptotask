<script lang="ts" generics="NextDays">
	import { beforeNavigate, goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { personnelStore } from '$features/personnel/stores/personnel.svelte';
	import { groupManagementStore } from '$features/personnel/stores/groups.svelte';
	import { pinnedGroupsStore } from '../stores/pinnedGroups.svelte';
	import { groupsStore } from '../stores/groups.svelte';
	import UsersIcon from '@lucide/svelte/icons/users';
	import * as Alert from '$lib/components/ui/alert';
	import { Button } from '$lib/components/ui/button';
	import * as DataTable from '$lib/components/ui/data-table';
	import * as Empty from '$lib/components/ui/empty/index.js';
	import { useDataTable } from '$lib/components/ui/data-table';
	import type { ColumnDef, DataTableGroup, DataTableState } from '$lib/components/ui/data-table';
	import { WorkspaceToolbar, type WorkspaceToolbarProps } from '$lib/components/patterns/workspace-toolbar';
	import type { PersonnelPageContext } from '$features/personnel/contexts/PersonnelPageContext.svelte';
	import type { Personnel } from '../personnel.types';
	import { personnelRecordHref } from '../personnelRecordHref';
	import {
		parseRosterFilter,
		ROSTER_FILTER_PARAM,
		rosterFilterAnswerable,
		sameRosterFilter,
		serializeRosterFilter
	} from '../rosterFilter';
	import { matchesRosterFilter, type RosterFilter } from '../rosterSignals';
	import type { Band } from '../groupTree';
	import { MediaQuery, SvelteSet } from 'svelte/reactivity';
	import { onDestroy, tick, untrack, type Snippet } from 'svelte';
	import type { ComposerKind } from '../rosterComposer';
	import PersonnelBulkBar from './roster/PersonnelBulkBar.svelte';
	import PersonnelFilterChips from './roster/PersonnelFilterChips.svelte';
	import PersonnelGroupHeader from './roster/PersonnelGroupHeader.svelte';
	import PersonnelRosterHeader from './roster/PersonnelRosterHeader.svelte';
	import PersonnelRosterRow from './roster/PersonnelRosterRow.svelte';
	import RosterBulkComposer from './roster/RosterBulkComposer.svelte';
	import RosterNotePopover from './roster/RosterNotePopover.svelte';
	import RosterPeekPanel from './roster/RosterPeekPanel.svelte';
	import { personnelToolbarItems } from './roster/personnelToolbarItems';
	import { RosterQuickEdit } from './roster/quickEdit.svelte';
	import type { RosterRowControls } from './roster/rosterRow';
	import { RosterSelection } from './roster/rosterSelection.svelte';

	interface Props {
		ctx: PersonnelPageContext;
		nextDays?: Snippet<[calendar: NextDays | null]>;
	}

	let { ctx, nextDays }: Props = $props();
	const orgUrlSegment = $derived(ctx.orgUrlSegment ?? ctx.orgId);

	const ROSTER_PAGE_SIZE = 75;
	const peekFits = new MediaQuery('min-width: 1280px', false);
	const GROUPED_ROSTER_RENDER_LIMIT = 250;
	const groupKey = (person: Personnel): string => person.groupId ?? '';
	const groupOf = (person: Personnel): string | null => person.groupId;
	const canViewRoster = $derived(ctx.canViewRoster);
	const canAddPersonnel = $derived(ctx.canAddPersonnel);
	const tree = $derived(ctx.groupTree);
	const soleLeaf = $derived(ctx.soleLeafGroup);
	// One Group with nothing under it is the reader's whole roster: no band to draw and no A-Z or Group choice to make.
	const banded = $derived(soleLeaf === null);
	const nestedTree = $derived(tree.ordered.some((node) => node.hasChildren));
	const viewMode = $derived(banded ? ctx.viewMode : 'alphabetical');
	let locallyArchivedIds = new SvelteSet<string>();
	const visibleAllActivePersonnel = $derived(
		ctx.allActivePersonnel.filter((person) => !locallyArchivedIds.has(person.id))
	);
	const signalSummary = $derived(ctx.summarizeSignals(visibleAllActivePersonnel));

	const requestedFilter = $derived(parseRosterFilter(page.url.searchParams.get(ROSTER_FILTER_PARAM)));
	const rosterFilter = $derived<RosterFilter | null>(
		requestedFilter &&
			ctx.signals.status === 'ready' &&
			rosterFilterAnswerable(requestedFilter, {
				access: ctx.signals.access,
				lossesEnabled: ctx.lossesEnabled,
				statusTypes: ctx.signals.statusTypes
			})
			? requestedFilter
			: null
	);
	const filterUnavailable = $derived(
		requestedFilter !== null && (ctx.signals.status === 'failed' || (ctx.signals.status === 'ready' && !rosterFilter))
	);
	function shownByFilter(person: Personnel): boolean {
		if (!rosterFilter) return true;
		const row = ctx.signalRow(person);
		return row.kind !== 'ready' || matchesRosterFilter(row.value, rosterFilter);
	}
	const visibleAlphabeticalPersonnel = $derived(
		ctx.alphabeticalPersonnel.filter((person) => !locallyArchivedIds.has(person.id) && shownByFilter(person))
	);
	const visibleFilteredPersonnel = $derived(
		ctx.filteredPersonnel.filter((person) => !locallyArchivedIds.has(person.id) && shownByFilter(person))
	);

	function showFilter(next: RosterFilter | null): void {
		const url = new URL(page.url);
		if (next) url.searchParams.set(ROSTER_FILTER_PARAM, serializeRosterFilter(next));
		else url.searchParams.delete(ROSTER_FILTER_PARAM);
		const target = `${url.pathname}${url.search}` as `/org/${string}/personnel`;
		void goto(resolve(target), { replaceState: true, keepFocus: true, noScroll: true });
	}

	function toggleFilter(next: RosterFilter): void {
		showFilter(sameRosterFilter(requestedFilter, next) ? null : next);
	}

	$effect(() => {
		const raw = page.url.searchParams.get(ROSTER_FILTER_PARAM);
		if (raw !== null && parseRosterFilter(raw) === null) showFilter(null);
	});
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
		const searched = new Set(ctx.filteredPersonnel.map((person) => person.id));
		let count = 0;
		let bySearch = false;
		let byFilter = false;
		for (const person of selectedPeople) {
			const hiddenBySearch = !searched.has(person.id);
			const hiddenByFilter = !shownByFilter(person);
			if (!hiddenBySearch && !hiddenByFilter) continue;
			count++;
			bySearch ||= hiddenBySearch;
			byFilter ||= hiddenByFilter;
		}
		return { count, by: bySearch && byFilter ? 'search and filter' : byFilter ? 'filter' : 'search' } as const;
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
			{ key: 'role', header: 'Duty Role', value: (p) => p.clinicRole, hiddenBelow: '@3xl', hidden: peekOpen },
			{ key: 'group', header: 'Group', value: (p) => p.groupName, hiddenBelow: '@3xl', hidden: peekOpen },
			{
				key: 'attention',
				header: 'Needs attention',
				value: () => '',
				searchable: false,
				sortable: false,
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

	const groupedColumns = $derived(personnelColumns.filter((column) => column.key !== 'group'));

	const azTable = useDataTable<Personnel>({
		data: () => holdOrder(visibleAlphabeticalPersonnel, 'az'),
		columns: () => personnelColumns,
		initialSortKey: 'name',
		initialSortDirection: 'asc',
		pageSize: ROSTER_PAGE_SIZE
	});

	const groupedTable = useDataTable<Personnel>({
		data: () => holdOrder(visibleFilteredPersonnel, 'grouped'),
		columns: () => groupedColumns,
		initialSortKey: 'name',
		initialSortDirection: 'asc',
		groupBy: { key: groupKey }
	});

	interface RosterSection extends DataTableGroup<Personnel> {
		level: number;
		name: string;
		/** Everyone in the section's Group and its sub-groups, which the header counts and acts on. */
		people: Personnel[];
		topLevel: boolean;
	}

	// Each Group is a section of its own members in tree order, its sub-groups' sections after it. Collapsing a Group
	// hides its members and every section below it.
	const sections = $derived.by((): RosterSection[] => {
		const sorted = new Map(groupedTable.groups.map((group) => [group.key, group.rows]));
		const out: RosterSection[] = [];
		let room = GROUPED_ROSTER_RENDER_LIMIT;
		const take = (key: string, collapsed: boolean): Personnel[] => {
			const rows = sorted.get(key) ?? [];
			if (collapsed) return rows;
			const shown = rows.slice(0, room);
			room -= shown.length;
			return shown;
		};
		const subtree = (band: Band<Personnel>): Personnel[] => [...band.hq, ...band.children.flatMap(subtree)];
		const visit = (band: Band<Personnel>) => {
			const { node } = band;
			const collapsed = ctx.collapsedGroups.has(node.id);
			out.push({
				key: node.id,
				label: tree.label(node.id),
				name: node.level === 0 ? tree.label(node.id) : node.name,
				level: node.level,
				topLevel: node.parentId === null,
				rows: take(node.id, collapsed),
				people: subtree(band),
				collapsed
			});
			if (!collapsed) band.children.forEach(visit);
		};
		tree.bands(visibleFilteredPersonnel, groupOf).forEach(visit);
		// People outside the tree: Unassigned last, and before it anyone whose Group left the catalog, by name, as today.
		const loose = groupedTable.groups
			.filter((group) => !tree.node(group.key))
			.toSorted(
				(a, b) => Number(a.key === '') - Number(b.key === '') || a.rows[0].groupName.localeCompare(b.rows[0].groupName)
			);
		for (const group of loose) {
			const collapsed = ctx.collapsedGroups.has(group.key);
			const label = group.key ? group.rows[0].groupName : 'Unassigned';
			out.push({
				key: group.key,
				label,
				name: label,
				level: 0,
				topLevel: true,
				rows: take(group.key, collapsed),
				people: group.rows,
				collapsed
			});
		}
		return out;
	});
	const sectionByKey = $derived(new Map(sections.map((section) => [section.key, section])));
	const bandedTable: DataTableState<Personnel> = Object.create(groupedTable, {
		groups: { get: () => sections },
		toggleGroup: { value: (key: string) => ctx.toggleGroup(key) },
		expandAll: { value: () => ctx.collapsedGroups.clear() },
		collapseAll: { value: () => sections.forEach((section) => ctx.collapsedGroups.add(section.key)) }
	});

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

	$effect(() => {
		void [
			azTable.sortKey,
			azTable.sortDirection,
			azTable.search,
			groupedTable.sortKey,
			groupedTable.sortDirection,
			groupedTable.search,
			viewMode
		];
		heldOrders = null;
	});

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
	let peekedId = $state<string | null>(null);
	let peekBrowsing = $state(false);
	let peekPanel = $state<RosterPeekPanel<NextDays>>();
	const peekedPerson = $derived(
		peekedId && !locallyArchivedIds.has(peekedId) ? (ctx.getPersonnelById(peekedId) ?? null) : null
	);
	const peekOpen = $derived(peekFits.current && canViewRoster && peekedPerson !== null);
	const groupedRosterLimited = $derived(
		viewMode === 'by-group' && groupedTable.totalRows > GROUPED_ROSTER_RENDER_LIMIT
	);
	const shouldGateGroupedRoster = $derived(groupedRosterLimited && !rosterSearch.trim());
	const activeTable = $derived(viewMode === 'alphabetical' ? azTable : bandedTable);
	const shownRows = $derived(
		activeTable.groups.length > 0
			? activeTable.groups.flatMap((group) => (group.collapsed ? [] : group.rows))
			: activeTable.rows
	);
	const shownIds = $derived(shownRows.map((person) => person.id));
	const peekSequence = $derived(viewMode === 'alphabetical' ? azTable.allRows : shownRows);
	const peekPosition = $derived({
		index: peekSequence.findIndex((person) => person.id === peekedId),
		total: peekSequence.length
	});
	const quickEdit = new RosterQuickEdit({
		person: (id) => ctx.getPersonnelById(id),
		groups: () => groupManagementStore.items,
		save: (id, data) => {
			holdCurrentOrder();
			return personnelStore.updateOrThrow(id, data);
		},
		refreshSignals: (ids) => void ctx.signals.refresh(ids),
		peekChanged: (id, before, after) => ctx.peek.changed(id, before, after),
		dataSheetHref: (person) => personnelRecordHref(orgUrlSegment, person, 'data-sheet'),
		navigate: (href, delta) => (delta ? history.go(delta) : void goto(href)),
		closed: (id) => void restoreRowFocus(id)
	});
	beforeNavigate((navigation) => quickEdit.guardNavigation(navigation));
	$effect(() => quickEdit.closeIfGone());
	$effect(() => () => quickEdit.dispose());
	const rowControls: RosterRowControls = {
		get selectable() {
			return canSelect;
		},
		isSelected: (id) => selection.has(id),
		select: (id, selected, range) => selection.set(id, selected, range ? shownIds : undefined),
		get filter() {
			return rosterFilter;
		},
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
		edit: quickEdit,
		get peekedId() {
			return peekOpen ? peekedId : null;
		},
		get peekFits() {
			return peekFits.current;
		},
		peek(person) {
			if (!peekFits.current || !ctx.canOpenPersonnelDetail(person)) return false;
			showPeek(person, false);
			return true;
		},
		closePeek,
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

	function replaceComposer(open: () => void): void {
		ctx.signals.noticeDay();
		const composer = notePerson ? noteComposer : bulkCompose ? bulkComposer : undefined;
		if (composer) composer.requestClose(open);
		else if (peekPanel) peekPanel.release(open);
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
		const members = visibleAllActivePersonnel.filter((person) => tree.contains(key, person.groupId));
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

	const orgId = $derived(ctx.orgId);
	$effect(() => {
		void orgId;
		notePerson = null;
		bulkCompose = null;
		selection.clear();
		peekedId = null;
	});

	$effect(() => {
		const peek = ctx.peek;
		const id = peekOpen ? peekedId : null;
		const browsing = peekBrowsing;
		untrack(() => (id ? peek.show(id, { browsing }) : peek.close()));
	});

	$effect(() => {
		const peek = ctx.peek;
		return () => peek.close();
	});

	$effect(() => {
		if (!peekOpen || !peekedPerson || shownByFilter(peekedPerson)) return;
		untrack(() => {
			const close = () => {
				peekedId = null;
				const next = rowControls.tabRowId;
				if (next) void restoreRowFocus(next);
			};
			if (peekPanel) peekPanel.release(close);
			else close();
		});
	});

	async function focusRow(id: string): Promise<void> {
		await tick();
		document.querySelector<HTMLElement>(`[data-roster-row="${CSS.escape(id)}"]`)?.focus();
	}

	async function focusAfterClose(id: string): Promise<void> {
		await tick();
		const row = document.querySelector<HTMLElement>(`[data-roster-row="${CSS.escape(id)}"]`);
		(
			row ??
			document.querySelector<HTMLElement>('[data-roster-row]') ??
			document.querySelector<HTMLElement>('[data-slot="workspace-toolbar"] input[type="search"]')
		)?.focus();
	}

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
				if (viewMode === 'alphabetical') azTable.setPage(Math.floor(index / ROSTER_PAGE_SIZE) + 1);
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
			void focusAfterClose(id);
		};
		if (peekPanel) peekPanel.release(close);
		else close();
	}

	function recordHref(person: Personnel): string {
		return personnelRecordHref(orgUrlSegment, person);
	}

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

	function showAlphabetical(): void {
		ctx.viewMode = 'alphabetical';
	}

	function setRosterSearch(value: string): void {
		rosterSearch = value;
		ctx.searchQuery = value;
	}

	const toolbarItems = $derived(
		personnelToolbarItems({
			viewMode: banded ? ctx.viewMode : null,
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
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="@container/roster flex max-h-full min-h-0 min-w-0 flex-1 flex-col gap-4 self-start overflow-clip px-6 pt-4 pb-5 max-sm:p-3"
			onkeydown={handleRosterKeydown}
		>
			<PersonnelRosterHeader
				unitName={ctx.orgName}
				scopeLabel={soleLeaf?.name ?? null}
				activeCount={visibleAllActivePersonnel.length}
				summary={signalSummary}
				canViewAvailability={ctx.canViewAvailability && !peekOpen}
				filter={rosterFilter}
				statusTypes={ctx.signals.statusTypes}
				onToggleFilter={toggleFilter}
			/>

			<WorkspaceToolbar
				ariaLabel="Personnel controls"
				items={toolbarItems}
				search={toolbarSearch}
				primary={toolbarPrimary}
			/>

			<PersonnelFilterChips
				summary={signalSummary}
				expectedCount={ctx.expectedChipCount}
				filter={rosterFilter}
				onToggle={(chip) => toggleFilter({ kind: 'chip', chip })}
			/>

			{#if ctx.signals.status === 'failed'}
				<Alert.Root role="status">
					<Alert.Description>
						Today's status and Needs attention could not be loaded.
						{#if filterUnavailable}<span class="block">Filter unavailable.</span>{/if}
					</Alert.Description>
					<Alert.Action>
						<Button type="button" variant="outline" size="xs" onclick={() => ctx.signals.reload()}>Reload</Button>
					</Alert.Action>
				</Alert.Root>
			{/if}

			{#if filterUnavailable && ctx.signals.status === 'ready'}
				<Alert.Root role="status">
					<Alert.Description>Filter unavailable.</Alert.Description>
					<Alert.Action>
						<Button type="button" variant="outline" size="xs" onclick={() => showFilter(null)}>Clear filter</Button>
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
					<Button onclick={showAlphabetical}>Use A-Z View</Button>
				</div>
			{:else}
				<div
					class="flex min-h-0 min-w-0 flex-1 [&_[data-slot='data-table']]:min-h-0 [&_[data-slot='data-table']]:w-full [&_[data-slot='data-table']]:flex-1"
				>
					<DataTable.DataTable
						table={activeTable}
						columns={viewMode === 'by-group' ? groupedColumns : personnelColumns}
						ariaLabel="Personnel roster"
						stickyGroup={nestedTree ? (key) => sectionByKey.get(key)?.level === 0 : undefined}
						emptyMessage={rosterFilter
							? 'No personnel match this filter.'
							: rosterSearch.trim()
								? 'No personnel match your search.'
								: 'No personnel in this Group.'}
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
							{@const section = sectionByKey.get(group.key)}
							{@const people = section?.people ?? []}
							{@const ids = people.map((person) => person.id)}
							{@const unassigned = group.key === ''}
							{@const groupId = unassigned ? null : group.key}
							<PersonnelGroupHeader
								{group}
								level={section?.level ?? 0}
								name={section?.name}
								{people}
								{ctx}
								pinned={pinnedGroupsStore.list.includes(group.key)}
								{unassigned}
								onTogglePin={ctx.canPinGroups && (unassigned || section?.topLevel) ? togglePin : null}
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
				<div class="flex min-h-6 items-center justify-between gap-4 font-mono text-xs text-muted-foreground">
					<span class="flex flex-wrap items-center gap-x-2">
						<span aria-live="polite">
							{#if groupedRosterLimited}
								Showing {shownRows.length} of {groupedTable.totalRows} matches. Keep typing to narrow.
							{:else}
								{activeTable.totalRows} of {visibleAllActivePersonnel.length}
								{rosterFilter ? 'match' : 'shown'}
							{/if}
						</span>
						{#if groupedRosterLimited}
							<Button type="button" variant="outline" size="xs" onclick={showAlphabetical}>Use A-Z View</Button>
						{/if}
					</span>
					<span class="flex gap-4 whitespace-nowrap max-md:hidden @max-xl/roster:hidden" aria-hidden="true">
						{#if ctx.canReadPersonnelDetails && peekFits.current}<span>Space preview</span>{/if}
						{#if canSelect}<span>X select</span>{/if}
						{#if canNoteAny}<span>N note</span>{/if}
						{#if canQuickEditAny}<span>E quick edit</span>{/if}
						{#if ctx.canReadPersonnelDetails}<span>↵ open record</span>{/if}
					</span>
				</div>
			{/if}
			{#if selectedPeople.length > 0}
				<!-- overflow-clip, not hidden: hidden makes a scroll container and breaks sticky. -->
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
		{#if peekOpen && peekedPerson}
			<RosterPeekPanel
				bind:this={peekPanel}
				{ctx}
				person={peekedPerson}
				position={peekPosition}
				onstep={(step) => stepPeek(step, false)}
				onclose={closePeek}
				onquickedit={(person) => quickEdit.open(person)}
				oncompose={replaceComposer}
				{nextDays}
			/>
		{/if}
	{/if}
</div>

{#if notePerson}
	{#key notePerson.id}
		<RosterNotePopover bind:this={noteComposer} {ctx} person={notePerson} onclose={closeNote} />
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

{#if quickEdit.prompt}
	{#await import('./roster/PersonnelQuickEditPrompt.svelte') then { default: QuickEditPrompt }}
		<QuickEditPrompt edit={quickEdit} />
	{/await}
{/if}
