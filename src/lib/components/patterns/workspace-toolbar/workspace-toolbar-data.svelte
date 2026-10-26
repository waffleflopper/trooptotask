<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import ListFilter from '@lucide/svelte/icons/list-filter';
	import SearchIcon from '@lucide/svelte/icons/search';
	import XIcon from '@lucide/svelte/icons/x';
	import { onDestroy, tick, untrack } from 'svelte';
	import type { Attachment } from 'svelte/attachments';
	import { Button } from '$lib/components/ui/button';
	import * as ButtonGroup from '$lib/components/ui/button-group';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import * as InputGroup from '$lib/components/ui/input-group';
	import * as Select from '$lib/components/ui/select';
	import { Spinner } from '$lib/components/ui/spinner';
	import { Toggle } from '$lib/components/ui/toggle';
	import { cn } from '$lib/utils.js';
	import { fitToolbar, type FitResult } from './fit-toolbar.js';
	import {
		isFilterActive,
		isMenuOnly,
		sectionOf,
		type ToolbarAction,
		type ToolbarFilter,
		type ToolbarItem,
		type ToolbarMultiSelect,
		type ToolbarSelect,
		type ToolbarToggle,
		type ToolbarView,
		type WorkspaceToolbarProps
	} from './toolbar-types.js';
	import WorkspaceToolbarIcon from './workspace-toolbar-icon.svelte';
	import WorkspaceToolbarMenu from './workspace-toolbar-menu.svelte';
	import WorkspaceToolbarMore, { actionItems, moreButton } from './workspace-toolbar-more.svelte';

	let { ariaLabel, items, bare = false, search, primary, compactBelow }: WorkspaceToolbarProps = $props();
	const uid = $props.id();
	const COMPACT_BELOW_PX = { sm: 640 } as const;

	type Metrics = {
		available: number;
		gap: number;
		more: number;
		primary: number;
		searchField: number;
		searchIcon: number;
		// The mode the DOM was in when these sizes were read; a button that changes between icon and text is stale until re-read.
		compact: boolean;
		items: Record<string, number>;
	};

	let metrics = $state.raw<Metrics>({
		available: 0,
		gap: 0,
		more: 0,
		primary: 0,
		searchField: 0,
		searchIcon: 0,
		compact: false,
		items: {}
	});
	let searchOpen = $state(false);
	let rowElement = $state<HTMLElement | null>(null);
	let searchInput = $state<HTMLInputElement | null>(null);
	let closeButton = $state<HTMLButtonElement | null>(null);
	let searchIconWrapper = $state<HTMLElement | null>(null);

	const views = $derived(items.filter((item): item is ToolbarView => sectionOf(item) === 'view'));
	const filters = $derived(items.filter((item): item is ToolbarFilter => sectionOf(item) === 'filters'));
	const actions = $derived(items.filter((item): item is ToolbarAction => sectionOf(item) === 'actions'));
	// The most important action sits next to More and the primary, so the row reads actions in reverse rank.
	const actionsInRowOrder = $derived(actions.toReversed());
	// Keyed on the toolbar's own width so a sidebar that narrows the workspace folds it like a phone would.
	let lastCompact = false;
	const compact = $derived.by(() => {
		if (!compactBelow) return false;
		if (metrics.available <= 0) return lastCompact;
		lastCompact = metrics.available < COMPACT_BELOW_PX[compactBelow];
		return lastCompact;
	});
	const searchOwnRow = $derived(compact && Boolean(search));
	const primaryIconOnly = $derived(compact && Boolean(primary?.icon));
	const foldsToMore = (item: ToolbarItem): boolean => isMenuOnly(item) || (compact && sectionOf(item) !== 'view');
	const rowCandidates = $derived(items.filter((item) => !foldsToMore(item)));
	// Search on its own row never competes for the controls' width, so the fit sees no search at all.
	const rowSearch = $derived(searchOwnRow ? undefined : search);

	let lastFit: FitResult | null = null;
	const fit = $derived.by((): FitResult | null => {
		const measured = metrics;
		// A host with no width is hidden, not narrow; keep its last layout until it is measured again.
		if (measured.available <= 0) return lastFit;
		const ready =
			measured.compact === compact &&
			measured.more > 0 &&
			(!primary || measured.primary > 0) &&
			(!rowSearch || (measured.searchField > 0 && measured.searchIcon > 0)) &&
			rowCandidates.every((item) => measured.items[item.id] > 0);
		// An item that is not measured yet waits in More under the last fit; unfolding everything would unmount More.
		if (!ready) return lastFit;
		const next = fitToolbar({
			available: measured.available,
			gap: measured.gap,
			pinnedWidth: primary ? measured.primary : 0,
			moreWidth: measured.more,
			items: items.map((item) => ({
				id: item.id,
				width: measured.items[item.id] ?? 0,
				section: sectionOf(item),
				menuOnly: foldsToMore(item)
			})),
			...(rowSearch
				? { searchMinWidth: measured.searchField, searchIconWidth: measured.searchIcon }
				: { searchMinWidth: null, searchIconWidth: null })
		});
		if (
			lastFit &&
			lastFit.searchCollapsed === next.searchCollapsed &&
			lastFit.visibleIds.join('\n') === next.visibleIds.join('\n')
		) {
			return lastFit;
		}
		lastFit = next;
		return next;
	});

	const visibleIds = $derived(new Set(fit ? fit.visibleIds : rowCandidates.map((item) => item.id)));
	const rowViews = $derived(views.filter((item) => visibleIds.has(item.id)));
	const rowFilters = $derived(filters.filter((item) => visibleIds.has(item.id)));
	const rowActions = $derived(actionsInRowOrder.filter((item) => visibleIds.has(item.id)));
	const moreViews = $derived(views.filter((item) => !visibleIds.has(item.id)));
	const moreFilters = $derived(filters.filter((item) => !visibleIds.has(item.id)));
	const moreActions = $derived([
		...actionsInRowOrder.filter((item) => !item.menuOnly && !visibleIds.has(item.id)),
		...actions.filter((item) => item.menuOnly)
	]);
	const showMore = $derived(moreViews.length + moreFilters.length + moreActions.length > 0);
	const searchMode = $derived<'field' | 'icon' | 'open' | 'none'>(
		!search ? 'none' : searchOwnRow ? 'field' : fit?.searchCollapsed ? (searchOpen ? 'open' : 'icon') : 'field'
	);
	const trailingId = $derived(rowActions[0]?.id ?? (showMore ? 'more' : primary?.id));
	const searchText = $derived(search?.value.trim() ?? '');
	const searchPlacement = $derived(search?.placement ?? 'before-filters');

	$effect.pre(() => {
		if (!import.meta.env.DEV) return;
		const ids = [...items.map((item) => item.id), ...(primary ? [primary.id] : [])];
		const duplicate = ids.find((id, index) => ids.indexOf(id) !== index);
		if (duplicate) throw new Error(`WorkspaceToolbar "${ariaLabel}" has more than one item with id "${duplicate}".`);
	});

	let observer: ResizeObserver | undefined;

	// ResizeObserver delivers every changed box of one layout before paint; one delivery is one
	// metrics write and so one fit, which keeps an unfolded overflowing row from ever being painted.
	function record(entries: ResizeObserverEntry[]): void {
		const next: Metrics = { ...metrics, compact, items: {} };
		for (const { id } of rowCandidates) {
			if (metrics.items[id] !== undefined) next.items[id] = metrics.items[id];
		}
		for (const entry of entries) {
			const element = entry.target as HTMLElement;
			const width = entry.borderBoxSize[0]?.inlineSize ?? 0;
			if (element.hasAttribute('data-toolbar-row')) next.available = entry.contentBoxSize[0]?.inlineSize ?? 0;
			else if (element.hasAttribute('data-toolbar-more')) next.more = width;
			else if (element.hasAttribute('data-toolbar-primary')) next.primary = width;
			else if (element.dataset.toolbarSearchMeasure === 'field') next.searchField = width;
			else if (element.dataset.toolbarSearchMeasure === 'icon') next.searchIcon = width;
			else if (element.dataset.toolbarItem) next.items[element.dataset.toolbarItem] = width;
		}
		if (rowElement) next.gap = Number.parseFloat(getComputedStyle(rowElement).columnGap) || 0;
		if (!sameMetrics(metrics, next)) metrics = next;
	}

	function sameMetrics(a: Metrics, b: Metrics): boolean {
		const aIds = Object.keys(a.items);
		return (
			a.available === b.available &&
			a.gap === b.gap &&
			a.more === b.more &&
			a.primary === b.primary &&
			a.searchField === b.searchField &&
			a.searchIcon === b.searchIcon &&
			a.compact === b.compact &&
			aIds.length === Object.keys(b.items).length &&
			aIds.every((id) => a.items[id] === b.items[id])
		);
	}

	function measure(box: 'border-box' | 'content-box' = 'border-box'): Attachment<HTMLElement> {
		return (element) => {
			observer ??= new ResizeObserver(record);
			observer.observe(element, { box });
			return () => observer?.unobserve(element);
		};
	}

	let mounted = true;
	onDestroy(() => {
		mounted = false;
		observer?.disconnect();
	});

	function liveWrapper(id: string): HTMLElement | null {
		const wrappers = rowElement?.querySelectorAll<HTMLElement>('[data-toolbar-item]') ?? [];
		return [...wrappers].find((wrapper) => wrapper.dataset.toolbarItem === id) ?? null;
	}

	function searchIcon(): HTMLElement | null {
		return searchIconWrapper?.querySelector('button') ?? null;
	}

	function moreTrigger(): HTMLElement | null {
		return rowElement?.querySelector<HTMLElement>('[data-toolbar-more] button') ?? null;
	}

	// A Select keeps DOM focus on its trigger while open, and an open menu marks its trigger expanded,
	// so the live wrapper alone tells whether a leaving item holds focus or an open popover.
	function holdsFocus(id: string, active: Element | null): boolean {
		const wrapper = liveWrapper(id);
		return Boolean(
			wrapper && ((active && wrapper.contains(active)) || wrapper.querySelector('[aria-expanded="true"]'))
		);
	}

	type Layout = { ids: string[]; more: boolean; collapsed: boolean };
	let previousLayout: Layout | null = null;

	function focusAfterUpdate(target: () => HTMLElement | null | undefined): void {
		void tick().then(() => target()?.focus({ preventScroll: true }));
	}

	function handleLayoutChange(before: Layout, after: Layout): void {
		const active = document.activeElement;
		if (searchOpen && !after.collapsed) {
			searchOpen = false;
			if (active && active === closeButton) focusAfterUpdate(() => searchInput);
		}
		const leaving = before.ids.filter((id) => !after.ids.includes(id));
		if (leaving.some((id) => holdsFocus(id, active))) {
			focusAfterUpdate(moreTrigger);
		} else if (!before.collapsed && after.collapsed && active && active === searchInput) {
			focusAfterUpdate(searchIcon);
		} else if (before.more && !after.more && active && moreTrigger()?.contains(active)) {
			const returning = after.ids.filter((id) => !before.ids.includes(id));
			focusAfterUpdate(() =>
				liveWrapper(returning[0] ?? '')?.querySelector<HTMLElement>('button:not([disabled]), a[href], input')
			);
		}
	}

	$effect.pre(() => {
		const next: Layout = { ids: [...visibleIds], more: showMore, collapsed: Boolean(fit?.searchCollapsed) };
		const before = previousLayout;
		previousLayout = next;
		if (before && rowElement) untrack(() => handleLayoutChange(before, next));
	});

	async function openSearch(): Promise<void> {
		searchOpen = true;
		await tick();
		searchInput?.focus();
	}

	async function closeSearch(): Promise<void> {
		searchOpen = false;
		await tick();
		searchIcon()?.focus();
	}

	function closeSearchOnEscape(event: KeyboardEvent): void {
		if (searchMode !== 'open' || event.key !== 'Escape') return;
		// Chrome's native Escape on a search field would also clear the query.
		event.preventDefault();
		void closeSearch();
	}

	function findAction(path: string[]): ToolbarAction | null {
		let siblings: ToolbarAction[] = [...actions, ...(primary ? [primary] : [])];
		let found: ToolbarAction | null = null;
		for (const id of path) {
			found = siblings.find((action) => action.id === id) ?? null;
			if (!found || found.disabled || found.loading) return null;
			siblings = (found.menuItems ?? []).filter((item): item is ToolbarAction => item.kind === 'action');
		}
		return found;
	}

	// Menus queue their choice until they finish closing; a toolbar that unmounts first drops it.
	function run(path: string[]): void {
		if (!mounted) return;
		const action = findAction(path);
		if (action?.href) void goto(resolve(action.href as '/'));
		else action?.onclick?.();
	}

	// A busy action keeps focus, so it refuses presses itself instead of being natively disabled.
	function press(event: MouseEvent, action: ToolbarAction): void {
		if (action.loading) event.preventDefault();
		else action.onclick?.();
	}

	function optionLabel(item: ToolbarSelect, value: string): string {
		return item.options.find((option) => option.value === value)?.label ?? item.label;
	}

	function toggleValue(item: ToolbarMultiSelect, value: string, checked: boolean): void {
		item.onValuesChange(checked ? [...new Set([...item.values, value])] : item.values.filter((v) => v !== value));
	}

	function reasonId(id: string): string {
		return `${uid}-${id}-reason`;
	}
</script>

{#snippet actionButton(
	action: ToolbarAction,
	variant: 'default' | 'outline',
	live: boolean,
	props: Record<string, unknown> = {},
	iconOnly: boolean = false
)}
	<Button
		variant={action.destructive ? 'destructive' : variant}
		class={iconOnly ? 'size-8 px-0' : undefined}
		href={action.href}
		disabled={action.disabled}
		title={live ? action.disabledReason : undefined}
		aria-label={action.ariaLabel}
		aria-disabled={action.loading || action.disabled || undefined}
		aria-busy={action.loading || undefined}
		aria-describedby={live && action.disabledReason ? reasonId(action.id) : undefined}
		tabindex={live ? undefined : -1}
		onclick={live ? (event: MouseEvent) => press(event, action) : undefined}
		{...props}
	>
		{#if action.loading}
			<Spinner aria-hidden="true" />
		{:else}
			<WorkspaceToolbarIcon icon={action.icon} />
		{/if}
		{#if iconOnly}
			<span class="sr-only">{action.label}</span>
		{:else}
			{action.label}
		{/if}
		{#if action.menuItems}
			<ChevronDown aria-hidden="true" />
		{/if}
	</Button>
{/snippet}

{#snippet actionControl(
	action: ToolbarAction,
	variant: 'default' | 'outline',
	live: boolean,
	iconOnly: boolean = false
)}
	{#if live && action.menuItems}
		<WorkspaceToolbarMenu
			label={action.label}
			contentClass={action.menuItems.some((item) => item.kind === 'action' && item.description) ? 'w-75' : undefined}
		>
			{#snippet trigger(props)}
				{@render actionButton(action, variant, true, props, iconOnly)}
			{/snippet}
			{#snippet children(choose)}
				{@render actionItems(
					action.menuItems ?? [],
					[action.id],
					Boolean(action.disabled || action.loading),
					choose,
					run
				)}
			{/snippet}
		</WorkspaceToolbarMenu>
	{:else}
		{@render actionButton(action, variant, live, {}, iconOnly)}
	{/if}
	{#if live && action.disabledReason}
		<span id={reasonId(action.id)} class="sr-only">{action.disabledReason}</span>
	{/if}
{/snippet}

{#snippet viewControl(view: ToolbarView, live: boolean)}
	<ButtonGroup.Root aria-label={view.ariaLabel ?? view.label}>
		{#each view.options as option (option.value)}
			<Button
				variant={view.value === option.value ? 'secondary' : 'outline'}
				aria-pressed={view.value === option.value}
				aria-label={option.ariaLabel}
				disabled={view.disabled}
				title={live ? view.disabledReason : undefined}
				aria-describedby={live && view.disabledReason ? reasonId(view.id) : undefined}
				tabindex={live ? undefined : -1}
				onclick={live ? () => view.onValueChange(option.value) : undefined}
			>
				{option.label}
				{#if option.count === 'pending'}
					<span class="invisible tabular-nums" aria-hidden="true">000</span>
				{:else if option.count !== undefined}
					<span class="tabular-nums">{option.count}</span>
				{/if}
			</Button>
		{/each}
	</ButtonGroup.Root>
	{#if live && view.disabledReason}
		<span id={reasonId(view.id)} class="sr-only">{view.disabledReason}</span>
	{/if}
{/snippet}

{#snippet selectControl(item: ToolbarSelect, live: boolean)}
	<Select.Root type="single" value={item.value} onValueChange={live ? item.onValueChange : undefined}>
		<Select.Trigger aria-label={item.ariaLabel ?? item.label} tabindex={live ? undefined : -1}>
			<span>{optionLabel(item, item.value)}</span>
		</Select.Trigger>
		{#if live}
			<Select.Content>
				{#each item.options as option (option.value)}
					<Select.Item value={option.value} label={option.label} />
				{/each}
			</Select.Content>
		{/if}
	</Select.Root>
{/snippet}

{#snippet multiSelectButton(item: ToolbarMultiSelect, props: Record<string, unknown>)}
	<Button
		variant={isFilterActive(item) ? 'secondary' : 'outline'}
		aria-label={item.values.length > 0
			? `${item.ariaLabel ?? item.label}, ${item.values.length} selected`
			: (item.ariaLabel ?? item.label)}
		{...props}
	>
		<ListFilter aria-hidden="true" />
		{item.values.length > 0 ? `${item.label}: ${item.values.length}` : item.label}
	</Button>
{/snippet}

{#snippet multiSelectControl(item: ToolbarMultiSelect, live: boolean)}
	{#if live}
		<DropdownMenu.Root>
			<DropdownMenu.Trigger>
				{#snippet child({ props })}
					{@render multiSelectButton(item, props)}
				{/snippet}
			</DropdownMenu.Trigger>
			<DropdownMenu.Content class="w-auto min-w-48">
				<DropdownMenu.Label>{item.label}</DropdownMenu.Label>
				{#each item.options as option (option.value)}
					<DropdownMenu.CheckboxItem
						checked={item.values.includes(option.value)}
						closeOnSelect={false}
						onCheckedChange={(checked) => toggleValue(item, option.value, checked)}
					>
						{option.label}
					</DropdownMenu.CheckboxItem>
				{/each}
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	{:else}
		{@render multiSelectButton(item, { tabindex: -1 })}
	{/if}
{/snippet}

{#snippet toggleControl(item: ToolbarToggle, live: boolean)}
	<Toggle
		variant="outline"
		pressed={item.pressed}
		aria-label={item.ariaLabel}
		tabindex={live ? undefined : -1}
		onPressedChange={live ? item.onPressedChange : undefined}
	>
		{item.label}
	</Toggle>
{/snippet}

{#snippet itemControl(item: ToolbarItem, live: boolean)}
	{#if item.kind === 'view'}
		{@render viewControl(item, live)}
	{:else if item.kind === 'select'}
		{@render selectControl(item, live)}
	{:else if item.kind === 'multiSelect'}
		{@render multiSelectControl(item, live)}
	{:else if item.kind === 'toggle'}
		{@render toggleControl(item, live)}
	{:else}
		{@render actionControl(item, 'outline', live)}
	{/if}
{/snippet}

{#snippet liveItem(item: ToolbarItem)}
	<div data-toolbar-item={item.id} class={cn('flex shrink-0', trailingId === item.id && 'ml-auto')}>
		{@render itemControl(item, true)}
	</div>
{/snippet}

{#snippet searchControl(search: NonNullable<WorkspaceToolbarProps['search']>)}
	{#if searchMode === 'icon'}
		<div bind:this={searchIconWrapper} class="flex shrink-0">
			{@render searchIconButton({
				'aria-label': search.label,
				'aria-describedby': searchText ? `${uid}-search-text` : undefined,
				'aria-expanded': 'false',
				onclick: openSearch
			})}
			{#if searchText}
				<span id="{uid}-search-text" class="sr-only">Search text: {searchText}</span>
			{/if}
		</div>
	{:else}
		<div class={cn('flex min-w-40 flex-1', searchMode !== 'open' && !searchOwnRow && 'max-w-80')}>
			<InputGroup.Root>
				<InputGroup.Addon>
					<SearchIcon aria-hidden="true" />
				</InputGroup.Addon>
				<InputGroup.Input
					bind:ref={searchInput}
					type="search"
					aria-label={search.label}
					placeholder={search.placeholder}
					value={search.value}
					oninput={(event) => search.onValueChange(event.currentTarget.value)}
					onkeydown={closeSearchOnEscape}
				/>
			</InputGroup.Root>
		</div>
		{#if searchMode === 'open'}
			<Button
				bind:ref={closeButton}
				variant="ghost"
				size="icon"
				aria-label="Close search"
				onclick={closeSearch}
				onkeydown={closeSearchOnEscape}
			>
				<XIcon aria-hidden="true" />
			</Button>
		{/if}
	{/if}
{/snippet}

{#snippet searchIconButton(props: Record<string, unknown>)}
	<Button variant="outline" size="icon" class="relative" {...props}>
		<SearchIcon aria-hidden="true" />
		{#if searchText}
			<span aria-hidden="true" class="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-accent ring-2 ring-card"
			></span>
		{/if}
	</Button>
{/snippet}

<div
	role="toolbar"
	aria-label={ariaLabel}
	data-slot="workspace-toolbar"
	data-toolbar-search={searchMode}
	data-toolbar-ready={fit ? 'true' : 'false'}
	class={cn(
		'relative w-full min-w-0 shrink-0 overflow-clip text-card-foreground',
		bare ? 'p-1' : 'rounded-lg border border-border bg-card p-2'
	)}
>
	{#if search && searchOwnRow}
		<div data-toolbar-search-row class="mb-1.5 flex min-w-0 items-center">
			{@render searchControl(search)}
		</div>
	{/if}
	<div
		bind:this={rowElement}
		data-toolbar-row
		class="flex min-w-0 flex-nowrap items-center gap-1.5"
		{@attach measure('content-box')}
	>
		{#if searchMode !== 'open'}
			{#each rowViews as item (item.id)}
				{@render liveItem(item)}
			{/each}
		{/if}

		{#if search && !searchOwnRow && searchPlacement === 'before-filters'}
			{@render searchControl(search)}
		{/if}

		{#if searchMode !== 'open'}
			{#each rowFilters as item (item.id)}
				{@render liveItem(item)}
			{/each}
		{/if}

		{#if search && !searchOwnRow && searchPlacement === 'after-filters'}
			{@render searchControl(search)}
		{/if}

		{#if searchMode !== 'open'}
			{#each rowActions as item (item.id)}
				{@render liveItem(item)}
			{/each}
			{#if showMore}
				<div data-toolbar-more class={cn('flex shrink-0', trailingId === 'more' && 'ml-auto')}>
					<WorkspaceToolbarMore
						{ariaLabel}
						views={moreViews}
						filters={moreFilters}
						actions={moreActions}
						filtersLabel={compact}
						{run}
					/>
				</div>
			{/if}
			{#if primary}
				<div data-toolbar-item={primary.id} class={cn('flex shrink-0', trailingId === primary.id && 'ml-auto')}>
					{@render actionControl(primary, 'default', true, primaryIconOnly)}
				</div>
			{/if}
		{/if}
	</div>

	<div
		data-toolbar-measure
		aria-hidden="true"
		inert
		class="pointer-events-none invisible absolute inset-0 overflow-hidden"
	>
		<div class="flex w-max flex-nowrap items-center gap-1.5">
			{#each rowCandidates as item (item.id)}
				<div data-toolbar-item={item.id} class="flex shrink-0" {@attach measure()}>
					{@render itemControl(item, false)}
				</div>
			{/each}
			{#if rowSearch}
				<div data-toolbar-search-measure="field" class="flex w-40 shrink-0" {@attach measure()}>
					<InputGroup.Root>
						<InputGroup.Addon>
							<SearchIcon aria-hidden="true" />
						</InputGroup.Addon>
						<InputGroup.Input type="search" tabindex={-1} placeholder={rowSearch.placeholder} />
					</InputGroup.Root>
				</div>
				<div data-toolbar-search-measure="icon" class="flex shrink-0" {@attach measure()}>
					{@render searchIconButton({ tabindex: -1 })}
				</div>
			{/if}
			<div data-toolbar-more class="flex shrink-0" {@attach measure()}>
				{@render moreButton('', { tabindex: -1 }, undefined, compact)}
			</div>
			{#if primary}
				<div data-toolbar-item={primary.id} data-toolbar-primary class="flex shrink-0" {@attach measure()}>
					{@render actionControl(primary, 'default', false, primaryIconOnly)}
				</div>
			{/if}
		</div>
	</div>
</div>
