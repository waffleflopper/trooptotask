<script lang="ts">
	import { resolve } from '$app/paths';
	import * as Alert from '$lib/components/ui/alert';
	import { Button } from '$lib/components/ui/button';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { cn } from '$lib/utils';
	import {
		INBOX_PAGE_LIMIT,
		inboxItemKey,
		type InboxItem,
		type InboxItemRef,
		type InboxKind,
		type InboxSourceResult,
		type InboxTab
	} from '../../inboxTypes';
	import { formatAge } from './inboxFormat';
	import { eyebrowFor, INBOX_KIND_VIEWS } from './inboxKinds';
	import { INBOX_TONES } from './inboxTones';

	interface Props {
		tab: InboxTab;
		shownKinds: readonly InboxKind[];
		selected: InboxItemRef | null;
		/** Null until every source has settled once. */
		results: { [K in InboxKind]: InboxSourceResult<K> } | null;
		/** A newer read is in flight; the rows on screen are the last settled ones. */
		refreshing: boolean;
		hrefFor: (item: InboxItemRef) => string;
		onSelect: (item: InboxItemRef) => void;
		onRetry: () => void;
	}

	let { tab, shownKinds, selected, results, refreshing, hrefFor, onSelect, onRetry }: Props = $props();

	const items = $derived.by(() => {
		if (!results) return [];
		const merged: InboxItem[] = [];
		for (const kind of shownKinds) {
			const result = results[kind];
			if (result.status === 'ok') merged.push(...result.items);
		}
		return merged.sort((a, b) => stamp(b).localeCompare(stamp(a)));
	});

	const failedKinds = $derived(results ? shownKinds.filter((kind) => results[kind].status === 'error') : []);

	const truncated = $derived(
		results !== null &&
			shownKinds.some((kind) => {
				const result = results[kind];
				return result.status === 'ok' && result.count > INBOX_PAGE_LIMIT;
			})
	);

	function stamp(item: InboxItem) {
		return tab === 'done' ? (item.closedAt ?? item.receivedAt) : item.receivedAt;
	}

	function choose(event: MouseEvent, item: InboxItem) {
		if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
		event.preventDefault();
		onSelect({ kind: item.kind, id: item.id });
	}

	const now = new Date();
</script>

<div aria-busy={results === null || refreshing || undefined}>
	{#each failedKinds as kind (kind)}
		<div class="border-b border-border py-3 max-sm:px-4 lg:pr-4">
			<Alert.Root variant="destructive">
				<Alert.Description>{INBOX_KIND_VIEWS[kind].filterLabel} could not be loaded.</Alert.Description>
				<Button class="mt-1 w-fit" variant="outline" size="sm" onclick={onRetry}>Retry</Button>
			</Alert.Root>
		</div>
	{/each}

	{#if results === null}
		<div role="status" aria-label="Loading Inbox">
			{#each [0, 1, 2, 3, 4, 5] as row (row)}
				<div
					class="grid gap-1 border-b border-l-3 border-border border-l-transparent py-3.5 pr-4 pl-[13px] max-sm:px-4"
				>
					<div class="flex justify-between gap-3">
						<Skeleton class="h-3.5 w-44" />
						<Skeleton class="h-3.5 w-6" />
					</div>
					<Skeleton class="h-[22px] w-4/5" />
					<Skeleton class="h-5 w-1/2" />
				</div>
			{/each}
		</div>
	{:else if items.length === 0 && failedKinds.length === 0}
		<p class="py-12 text-center text-sm text-muted-foreground max-sm:px-4">
			{tab === 'open' ? 'Nothing needs a decision right now.' : 'Nothing was closed in the last 30 days.'}
		</p>
	{:else if items.length > 0}
		<ul aria-label={tab === 'open' ? 'Open items' : 'Done items'}>
			{#each items as item (inboxItemKey(item))}
				{@const key = inboxItemKey(item)}
				{@const tone = INBOX_TONES[INBOX_KIND_VIEWS[item.kind].tone]}
				{@const isSelected = selected !== null && inboxItemKey(selected) === key}
				{@const age = formatAge(stamp(item), now)}
				<li>
					<a
						href={resolve(hrefFor(item) as '/admin')}
						data-inbox-item={key}
						aria-current={isSelected ? 'true' : undefined}
						aria-labelledby="{key}-title"
						aria-describedby="{key}-meta"
						onclick={(event) => choose(event, item)}
						class={cn(
							'grid gap-1 border-b border-l-3 border-border py-3.5 pr-4 pl-[13px] text-foreground transition-colors',
							'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring',
							'max-sm:gap-1.5 max-sm:border-l-0 max-sm:p-4',
							isSelected ? [tone.bar, 'bg-muted'] : 'border-l-transparent hover:bg-muted/50'
						)}
					>
						<span id="{key}-meta" class="flex items-center justify-between gap-3">
							<span
								class={cn(
									'min-w-0 font-mono text-[11px] leading-[14px] font-semibold tracking-[0.08em] uppercase',
									'max-sm:rounded-sm max-sm:px-2 max-sm:py-0.5 max-sm:leading-4',
									tone.text,
									tone.tint
								)}>{eyebrowFor(item)}</span
							>
							<span class="shrink-0 font-mono text-[11px] leading-[14px] text-muted-foreground uppercase">
								<span class="sr-only">, </span>{age}{#if age !== 'now'}<span class="sr-only"> ago</span>{/if}
							</span>
							{#if item.summary}<span class="sr-only">, {item.summary}</span>{/if}
						</span>
						<span
							id="{key}-title"
							class={cn(
								'text-[15px] leading-[22px] max-sm:text-base max-sm:leading-6 max-sm:font-semibold',
								isSelected && 'font-semibold'
							)}>{item.title}</span
						>
						{#if item.summary}
							<span class="truncate text-sm text-muted-foreground" aria-hidden="true">{item.summary}</span>
						{/if}
					</a>
				</li>
			{/each}
		</ul>
		{#if truncated}
			<p class="py-3 text-xs text-muted-foreground max-sm:px-4">Showing the newest {INBOX_PAGE_LIMIT} of each kind.</p>
		{/if}
	{/if}
</div>
