<script lang="ts">
	import * as Alert from '$lib/components/ui/alert';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import * as Tabs from '$lib/components/ui/tabs';
	import * as SegmentedFilter from '$lib/components/patterns/segmented-filter';
	import * as TypeWorkspace from '$lib/components/patterns/type-management-workspace';
	import { formatRelativeDate } from '$lib/utils/dates';
	import { adminBadgeVariant, formatAdminLabel } from '../adminTheme';
	import {
		INBOX_KINDS,
		INBOX_PAGE_LIMIT,
		inboxItemKey,
		type InboxFilter,
		type InboxItem,
		type InboxItemRef,
		type InboxKind,
		type InboxSourceResult,
		type InboxTab
	} from '../../inboxTypes';
	import { INBOX_KIND_VIEWS } from './inboxKinds';

	interface Props {
		tab: InboxTab;
		filter: InboxFilter;
		selected: InboxItemRef | null;
		/** Null until every source has settled once. */
		results: { [K in InboxKind]: InboxSourceResult<K> } | null;
		/** A newer read is in flight; the rows on screen are the last settled ones. */
		refreshing: boolean;
		hidden: boolean;
		onTab: (tab: InboxTab) => void;
		onFilter: (filter: InboxFilter) => void;
		onSelect: (item: InboxItemRef) => void;
		onRetry: () => void;
	}

	let { tab, filter, selected, results, refreshing, hidden, onTab, onFilter, onSelect, onRetry }: Props = $props();

	const shownKinds = $derived(filter === 'all' ? INBOX_KINDS : INBOX_KINDS.filter((kind) => kind === filter));

	const items = $derived.by(() => {
		if (!results) return [];
		const merged: InboxItem[] = [];
		for (const kind of shownKinds) {
			const result = results[kind];
			if (result.status === 'ok') merged.push(...result.items);
		}
		const stamp = (item: InboxItem) => (tab === 'done' ? (item.closedAt ?? item.receivedAt) : item.receivedAt);
		return merged.sort((a, b) => stamp(b).localeCompare(stamp(a)));
	});

	const failedKinds = $derived(results ? shownKinds.filter((kind) => results[kind].status === 'error') : []);

	const truncated = $derived.by(() => {
		if (!results) return false;
		return shownKinds.some((kind) => {
			const result = results[kind];
			return result.status === 'ok' && result.count > INBOX_PAGE_LIMIT;
		});
	});

	// A count is only honest when every source answered.
	const filterOptions = $derived.by(() => {
		const counts = results
			? Object.fromEntries(
					INBOX_KINDS.map((kind) => [kind, results[kind].status === 'ok' ? results[kind].count : undefined])
				)
			: {};
		const total = INBOX_KINDS.every((kind) => typeof counts[kind] === 'number')
			? INBOX_KINDS.reduce((sum, kind) => sum + (counts[kind] ?? 0), 0)
			: undefined;
		return [
			{ value: 'all' as const, label: 'All', count: total },
			...INBOX_KINDS.map((kind) => ({
				value: kind,
				label: INBOX_KIND_VIEWS[kind].filterLabel,
				count: counts[kind]
			}))
		];
	});

	function itemBadge(item: InboxItem) {
		if (tab === 'open') return null;
		if (item.kind === 'accessRequest') return item.outcome ? formatAdminLabel(item.outcome) : 'Closed';
		return 'Closed';
	}

	const emptyText = $derived(
		tab === 'open' ? 'Nothing needs a decision right now.' : 'Nothing was closed in the last 30 days.'
	);
</script>

{#snippet panel()}
	<div class="grid content-start gap-3" aria-busy={results === null || refreshing || undefined}>
		{#each failedKinds as kind (kind)}
			<Alert.Root variant="destructive">
				<Alert.Description>{INBOX_KIND_VIEWS[kind].filterLabel} could not be loaded.</Alert.Description>
				<Button class="mt-1 w-fit" variant="outline" size="sm" onclick={onRetry}>Retry</Button>
			</Alert.Root>
		{/each}

		{#if results === null}
			<div role="status" aria-label="Loading Inbox" class="overflow-hidden rounded-md border border-border bg-card">
				{#each [0, 1, 2, 3, 4, 5] as row (row)}
					<div class="grid gap-2 border-b border-border/70 p-3 last:border-b-0">
						<Skeleton class="h-4 w-2/3" />
						<Skeleton class="h-3 w-1/2" />
						<Skeleton class="h-4 w-1/3" />
					</div>
				{/each}
			</div>
		{:else if items.length === 0 && failedKinds.length === 0}
			<p class="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
				{emptyText}
			</p>
		{:else if items.length > 0}
			<TypeWorkspace.ItemList aria-label={tab === 'open' ? 'Open items' : 'Done items'}>
				{#each items as item (inboxItemKey(item))}
					{@const view = INBOX_KIND_VIEWS[item.kind]}
					{@const done = itemBadge(item)}
					<TypeWorkspace.ListItem
						title={item.title}
						description={item.summary}
						selected={selected?.kind === item.kind && selected.id === item.id}
						onselect={() => onSelect({ kind: item.kind, id: item.id })}
					>
						{#snippet meta()}
							<Badge variant={item.kind === 'feedback' ? adminBadgeVariant(item.category) : 'secondary'}>
								{item.kind === 'feedback' ? formatAdminLabel(item.category) : view.label}
							</Badge>
							{#if view.badge}<Badge variant="outline">{view.badge}</Badge>{/if}
							{#if done}<Badge variant="outline">{done}</Badge>{/if}
							<span>{formatRelativeDate(tab === 'done' ? (item.closedAt ?? item.receivedAt) : item.receivedAt)}</span>
						{/snippet}
					</TypeWorkspace.ListItem>
				{/each}
			</TypeWorkspace.ItemList>
			{#if truncated}
				<p class="text-xs text-muted-foreground">Showing the newest {INBOX_PAGE_LIMIT} of each kind.</p>
			{/if}
		{/if}
	</div>
{/snippet}

<TypeWorkspace.List mobileHidden={hidden} class="grid content-start gap-3 lg:pr-1" aria-label="Inbox">
	<Tabs.Root value={tab} onValueChange={(value) => onTab(value === 'done' ? 'done' : 'open')} class="gap-3">
		<Tabs.List aria-label="Inbox status">
			<Tabs.Trigger value="open">Open</Tabs.Trigger>
			<Tabs.Trigger value="done">Done</Tabs.Trigger>
		</Tabs.List>
		<SegmentedFilter.Root
			label="Filter by kind"
			options={filterOptions}
			bind:value={() => filter, (next) => onFilter(next)}
		/>
		{#each ['open', 'done'] as const as value (value)}
			<Tabs.Content {value}>
				{#if tab === value}{@render panel()}{/if}
			</Tabs.Content>
		{/each}
	</Tabs.Root>
</TypeWorkspace.List>
