<script lang="ts">
	import { goto, invalidate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import InboxDetailPane from '$features/platform-admin/components/inbox/InboxDetailPane.svelte';
	import InboxQueue from '$features/platform-admin/components/inbox/InboxQueue.svelte';
	import { settleRead } from '$features/platform-admin/components/inbox/settle.svelte';
	import {
		INBOX_KINDS,
		inboxHref,
		parseInboxFilter,
		parseInboxItemKey,
		type InboxFilter,
		type InboxItemRef,
		type InboxKind,
		type InboxSourceResult,
		type InboxTab
	} from '$features/platform-admin/inboxTypes';
	import * as Alert from '$lib/components/ui/alert';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import * as TypeWorkspace from '$lib/components/patterns/type-management-workspace';

	let { data } = $props();

	type Results = { [K in InboxKind]: InboxSourceResult<K> };

	async function gather(sources: { [K in InboxKind]: Promise<InboxSourceResult<K>> }): Promise<Results> {
		const entries = await Promise.all(INBOX_KINDS.map(async (kind) => [kind, await sources[kind]] as const));
		return Object.fromEntries(entries) as Results;
	}

	const queue = settleRead(() => ({ source: data.sources, group: data.tab, promise: gather(data.sources) }));
	const stats = settleRead(() => ({ source: data.stats, group: 'stats', promise: data.stats }));

	// A different tab never shows the other tab's rows; a refresh of the same tab keeps its rows on screen.
	const results = $derived(queue.settled?.group === data.tab ? queue.settled.value : null);
	const refreshing = $derived(queue.settled?.source !== data.sources);

	const filter = $derived(parseInboxFilter(page.url.searchParams.get('kind')));
	const selected = $derived(parseInboxItemKey(page.url.searchParams.get('item')));

	// Back from a phone's full-screen item returns through history only when this page pushed the entry.
	let pushedItem = false;

	function show(state: { tab: InboxTab; filter: InboxFilter; item: InboxItemRef | null }, replaceState: boolean) {
		const target = inboxHref(state) as '/admin';
		void goto(resolve(target), { replaceState, noScroll: true, keepFocus: true });
	}

	function selectItem(item: InboxItemRef) {
		const replaceState = selected !== null;
		pushedItem = !replaceState;
		show({ tab: data.tab, filter, item }, replaceState);
	}

	function closeItem() {
		if (pushedItem) {
			pushedItem = false;
			history.back();
		} else {
			show({ tab: data.tab, filter, item: null }, true);
		}
	}

	const refreshQueue = () => invalidate('admin:inbox');
</script>

<svelte:head>
	<title>Inbox - Platform Admin</title>
</svelte:head>

<div class="flex min-h-0 flex-1 flex-col gap-3 p-2 md:p-4">
	<div class={['grid gap-3', selected && 'max-lg:hidden']}>
		<h1 class="text-xl font-semibold">Inbox</h1>
		<dl class="grid grid-cols-2 gap-3 sm:max-w-xl" aria-label="This month">
			{#each [{ key: 'newPeople', label: 'New people this month' }, { key: 'newOrganizations', label: 'New Organizations this month' }] as stat (stat.key)}
				<div class="grid min-h-16 content-between gap-1 rounded-md border border-border bg-card px-3 py-2">
					<dt class="text-xs text-muted-foreground">{stat.label}</dt>
					<dd class="text-xl font-semibold tabular-nums">
						{#if stats.settled === null}
							<Skeleton class="h-7 w-10" />
						{:else if stats.settled.value.status === 'ok'}
							{stats.settled.value[stat.key as 'newPeople' | 'newOrganizations']}
						{:else}
							<span class="text-sm font-normal text-muted-foreground">Unavailable</span>
						{/if}
					</dd>
				</div>
			{/each}
		</dl>
	</div>

	<TypeWorkspace.Root aria-label="Inbox" class="overflow-hidden p-0">
		<TypeWorkspace.Layout>
			<InboxQueue
				tab={data.tab}
				{filter}
				{selected}
				{results}
				{refreshing}
				hidden={selected !== null}
				onTab={(tab) => show({ tab, filter, item: null }, true)}
				onFilter={(next) => show({ tab: data.tab, filter: next, item: selected }, true)}
				onSelect={selectItem}
				onRetry={refreshQueue}
			/>
			<TypeWorkspace.Detail mobileHidden={selected === null} aria-label="Selected item">
				{#if selected}
					<div class="grid gap-3">
						<TypeWorkspace.MobileBack onclick={closeItem}>Inbox</TypeWorkspace.MobileBack>
						<InboxDetailPane item={selected} onQueueStale={refreshQueue} />
					</div>
				{:else}
					<Alert.Root>
						<Alert.Description>Select an item to review it.</Alert.Description>
					</Alert.Root>
				{/if}
			</TypeWorkspace.Detail>
		</TypeWorkspace.Layout>
	</TypeWorkspace.Root>
</div>
