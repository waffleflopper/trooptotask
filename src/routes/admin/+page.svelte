<script lang="ts">
	import { goto, invalidate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { onMount, tick } from 'svelte';
	import { MediaQuery } from 'svelte/reactivity';
	import AdminPage from '$features/platform-admin/components/AdminPage.svelte';
	import AdminPageHeader from '$features/platform-admin/components/AdminPageHeader.svelte';
	import InboxDetailPane from '$features/platform-admin/components/inbox/InboxDetailPane.svelte';
	import InboxQueue from '$features/platform-admin/components/inbox/InboxQueue.svelte';
	import { INBOX_KIND_VIEWS } from '$features/platform-admin/components/inbox/inboxKinds';
	import { settleRead } from '$features/platform-admin/components/inbox/settle.svelte';
	import {
		INBOX_KINDS,
		inboxHref,
		inboxItemKey,
		parseInboxFilter,
		parseInboxItemKey,
		type InboxFilter,
		type InboxItemRef,
		type InboxKind,
		type InboxSourceResult,
		type InboxTab
	} from '$features/platform-admin/inboxTypes';
	import * as SegmentedFilter from '$lib/components/patterns/segmented-filter';
	import * as TypeWorkspace from '$lib/components/patterns/type-management-workspace';
	import { Button } from '$lib/components/ui/button';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import * as Tabs from '$lib/components/ui/tabs';
	import { cn } from '$lib/utils';

	let { data } = $props();

	type Results = { [K in InboxKind]: InboxSourceResult<K> };

	async function gather(sources: { [K in InboxKind]: Promise<InboxSourceResult<K>> }): Promise<Results> {
		const entries = await Promise.all(INBOX_KINDS.map(async (kind) => [kind, await sources[kind]] as const));
		return Object.fromEntries(entries) as Results;
	}

	const queue = settleRead(() => ({ source: data.sources, group: data.tab, promise: gather(data.sources) }));
	const stats = settleRead(() => ({ source: data.stats, group: 'stats', promise: data.stats }));
	// The badge's count, so the sentence matches it on either tab.
	const openCount = settleRead(() => ({ source: data.inboxOpenCount, group: 'open', promise: data.inboxOpenCount }));
	const openTotal = $derived(openCount.settled?.value);

	// The tab a click asked for, until its load arrives, so the panel shows its skeleton at once instead of staying empty.
	let requestedTab = $state<InboxTab | null>(null);
	const tab = $derived(requestedTab ?? data.tab);

	// A different tab never shows the other tab's rows; a refresh of the same tab keeps its rows on screen.
	const results = $derived(queue.settled?.group === tab ? queue.settled.value : null);
	const refreshing = $derived(queue.settled?.source !== data.sources);

	const filter = $derived(parseInboxFilter(page.url.searchParams.get('kind')));
	const selected = $derived(parseInboxItemKey(page.url.searchParams.get('item')));
	const shownKinds = $derived(filter === 'all' ? INBOX_KINDS : INBOX_KINDS.filter((kind) => kind === filter));

	// The chips count the tab on screen; a count is only honest when its source answered.
	const counts = $derived.by(() => {
		const byKind = Object.fromEntries(
			INBOX_KINDS.map((kind) => [
				kind,
				results ? (results[kind].status === 'ok' ? results[kind].count : undefined) : null
			])
		) as Record<InboxKind, number | null | undefined>;
		const values = Object.values(byKind);
		const total = values.some((count) => count === null)
			? null
			: values.every((count) => typeof count === 'number')
				? values.reduce<number>((sum, count) => sum + (count ?? 0), 0)
				: undefined;
		return { byKind, total };
	});

	const filterOptions = $derived([
		{ value: 'all' as const, label: 'All', count: counts.total },
		...INBOX_KINDS.map((kind) => ({
			value: kind,
			label: INBOX_KIND_VIEWS[kind].filterLabel,
			count: counts.byKind[kind]
		}))
	]);

	const NUMBER_WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];

	function waitingSentence(open: number): string {
		if (open === 0) return 'Nothing is waiting on you. Everything is running on its own.';
		const count = NUMBER_WORDS[open] ?? String(open);
		return `${count} ${open === 1 ? 'thing is' : 'things are'} waiting on you. Everything else is running on its own.`;
	}

	const phone = new MediaQuery('max-width: 639.98px', false);
	const singlePane = new MediaQuery('max-width: 1023.98px', false);

	// The date is the operator's own, so it is only written once the page runs in their browser.
	let today = $state<Date | null>(null);
	onMount(() => {
		today = new Date();
	});
	const eyebrow = $derived.by(() => {
		if (phone.current) return typeof openTotal === 'number' ? `Platform · ${openTotal} open` : 'Platform';
		if (!today) return 'Platform';
		const date = today.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });
		return `Platform · ${date}`;
	});
	const month = $derived(new Date().toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' }));

	// Back from a phone's full-screen item returns through history only when this page pushed the entry.
	let pushedItem = false;
	let listScroll = 0;

	function show(state: { tab: InboxTab; filter: InboxFilter; item: InboxItemRef | null }, replaceState: boolean) {
		return goto(resolve(inboxHref(state) as '/admin'), { replaceState, noScroll: true, keepFocus: true });
	}

	function showTab(next: InboxTab) {
		requestedTab = next;
		void show({ tab: next, filter, item: null }, true).finally(() => {
			if (requestedTab === next) requestedTab = null;
		});
	}

	function selectItem(item: InboxItemRef) {
		const replaceState = selected !== null;
		pushedItem = !replaceState;
		// Read before the item hides the list, which would clamp the scroll to the item's height.
		if (singlePane.current && !replaceState) listScroll = document.getElementById('main-content')?.scrollTop ?? 0;
		void show({ tab, filter, item }, replaceState);
	}

	function closeItem() {
		if (pushedItem) {
			pushedItem = false;
			history.back();
		} else {
			void show({ tab, filter, item: null }, true);
		}
	}

	const refreshQueue = () => invalidate('admin:inbox');

	// With one pane showing, the item replaces the list: focus and scroll follow it there and back.
	let detailRegion = $state<HTMLElement | null>(null);
	let previousKey: string | null = null;
	$effect(() => {
		const key = selected ? inboxItemKey(selected) : null;
		const leaving = previousKey;
		previousKey = key;
		if (!singlePane.current || key === leaving) return;
		const scroller = document.getElementById('main-content');
		if (key && !leaving) {
			void tick().then(() => {
				scroller?.scrollTo({ top: 0 });
				detailRegion?.focus({ preventScroll: true });
			});
		} else if (!key && leaving) {
			void tick().then(() => {
				scroller?.scrollTo({ top: listScroll });
				document
					.querySelector<HTMLElement>(`[data-inbox-item="${CSS.escape(leaving)}"]`)
					?.focus({ preventScroll: true });
			});
		}
	});
</script>

<svelte:head>
	<title>Inbox - Platform Admin</title>
</svelte:head>

{#snippet summary()}
	{#if openTotal === undefined}
		<Skeleton class="h-6 w-[30rem] max-w-full" />
	{:else if openTotal === null}
		The Inbox could not be counted.
	{:else}
		{waitingSentence(openTotal)}
	{/if}
{/snippet}

{#snippet figures()}
	<div class="grid justify-items-end gap-1">
		<dl class="flex gap-7" aria-label="This month">
			{#each [{ key: 'newPeople', label: 'New people' }, { key: 'newOrganizations', label: 'New Organizations' }] as const as stat (stat.key)}
				<div class="grid justify-items-end gap-0.5">
					<dd
						class="order-1 justify-self-stretch text-end font-heading text-[28px] leading-[30px] font-bold tabular-nums"
					>
						{#if stats.settled === null}
							<Skeleton class="ml-auto h-[30px] w-8" />
						{:else if stats.settled.value.status === 'ok'}
							{stats.settled.value[stat.key]}
						{:else}
							<span aria-label="Unavailable">—</span>
						{/if}
					</dd>
					<dt class="order-2 font-mono text-[11px] leading-[14px] tracking-[0.06em] text-muted-foreground uppercase">
						{stat.label} · {month}
					</dt>
				</div>
			{/each}
		</dl>
		{#if stats.settled?.value.status === 'error'}
			<Button variant="ghost" size="xs" onclick={refreshQueue}>Retry figures</Button>
		{/if}
	</div>
{/snippet}

<AdminPage>
	<div class={cn(selected && 'max-lg:hidden')}>
		<AdminPageHeader {eyebrow} title="Inbox" description={summary} aside={figures} />
	</div>

	<Tabs.Root value={tab} onValueChange={(value) => showTab(value === 'done' ? 'done' : 'open')}>
		<div
			class={cn(
				'mb-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 max-sm:mb-2',
				selected && 'max-lg:hidden'
			)}
		>
			<SegmentedFilter.Root
				label="Filter by kind"
				options={filterOptions}
				bind:value={() => filter, (next) => void show({ tab, filter: next, item: selected }, true)}
			/>
			<!-- Its own row on a phone, so the wrap never depends on how wide the chips render. -->
			<div class="max-sm:w-full">
				<Tabs.List variant="line" aria-label="Inbox status">
					<Tabs.Trigger value="open">Open</Tabs.Trigger>
					<Tabs.Trigger value="done">Done</Tabs.Trigger>
				</Tabs.List>
			</div>
		</div>

		<div
			class={cn(
				'border-foreground max-sm:-mx-4 lg:grid lg:min-h-[37.5rem] lg:grid-cols-[minmax(20rem,27.5rem)_minmax(0,1fr)]',
				selected ? 'lg:border-t' : 'border-t'
			)}
		>
			{#each ['open', 'done'] as const as value (value)}
				<Tabs.Content {value}>
					{#if tab === value}
						<div class={cn('lg:h-full lg:border-r lg:border-border', selected && 'max-lg:hidden')}>
							<InboxQueue
								{tab}
								{shownKinds}
								{selected}
								{results}
								{refreshing}
								hrefFor={(item) => inboxHref({ tab, filter, item })}
								onSelect={selectItem}
								onRetry={refreshQueue}
							/>
						</div>
					{/if}
				</Tabs.Content>
			{/each}

			<section
				bind:this={detailRegion}
				tabindex="-1"
				aria-label="Selected item"
				class={cn(
					'outline-none max-sm:px-4 lg:sticky lg:top-0 lg:max-h-[calc(100svh-4.5rem)] lg:self-start lg:overflow-y-auto lg:pt-7 lg:pl-9',
					!selected && 'max-lg:hidden'
				)}
			>
				{#if selected}
					<div class="grid gap-5">
						<TypeWorkspace.MobileBack onclick={closeItem}>Inbox</TypeWorkspace.MobileBack>
						<InboxDetailPane item={selected} onQueueStale={refreshQueue} />
					</div>
				{:else}
					<p class="text-sm text-muted-foreground">Choose an item to see it here.</p>
				{/if}
			</section>
		</div>
	</Tabs.Root>
</AdminPage>
