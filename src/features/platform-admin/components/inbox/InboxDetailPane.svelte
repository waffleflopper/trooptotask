<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import { redirectToSensitiveActionStepUp } from '$features/identity';
	import * as Alert from '$lib/components/ui/alert';
	import { Button } from '$lib/components/ui/button';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { inboxItemKey, type InboxDetail, type InboxDetailResponse, type InboxItemRef } from '../../inboxTypes';
	import { detailComponentFor, INBOX_KIND_VIEWS } from './inboxKinds';

	let { item, onQueueStale }: { item: InboxItemRef; onQueueStale: () => void } = $props();

	type View = { key: string; status: 'ok'; detail: InboxDetail } | { key: string; status: 'notFound' | 'error' };

	const key = $derived(inboxItemKey(item));
	let view = $state.raw<View | null>(null);
	let attempt = $state(0);
	let reloadFailed = $state(false);
	let controller: AbortController | undefined;

	// A response for an item the person already left, or for an older attempt, changes nothing.
	async function read(readKey: string, keepOnError = false) {
		controller?.abort();
		const mine = new AbortController();
		controller = mine;
		try {
			const response = await fetch(`/admin/api/inbox/item?item=${encodeURIComponent(readKey)}`, {
				signal: mine.signal
			});
			const body: unknown = await response.json().catch(() => null);
			if (mine.signal.aborted) return;
			if (response.status === 403 && redirectToSensitiveActionStepUp(body)) return;
			if (!response.ok) throw new Error('Inbox item unavailable');
			const parsed = body as InboxDetailResponse;
			reloadFailed = false;
			view =
				parsed.status === 'ok'
					? { key: readKey, status: 'ok', detail: parsed.detail }
					: { key: readKey, status: 'notFound' };
		} catch {
			if (mine.signal.aborted) return;
			// After a command, the item on screen may hold a draft or a result the person still needs.
			if (keepOnError && view?.key === readKey && view.status === 'ok') reloadFailed = true;
			else view = { key: readKey, status: 'error' };
		}
	}

	$effect(() => {
		void attempt;
		const readKey = key;
		untrack(() => {
			reloadFailed = false;
			if (view?.status === 'error') view = null;
			void read(readKey);
		});
	});

	onDestroy(() => controller?.abort());

	function refreshAfterCommand() {
		void read(key, true);
		onQueueStale();
	}

	const shown = $derived(view?.key === key ? view : null);
	const kindView = $derived(INBOX_KIND_VIEWS[item.kind]);
</script>

<div aria-busy={shown === null || undefined}>
	{#if shown?.status === 'ok'}
		{#if reloadFailed}
			<Alert.Root variant="destructive" class="mb-5 max-w-[620px]">
				<Alert.Description>This item could not be reloaded, so it may be out of date.</Alert.Description>
				<Button class="mt-1 w-fit" variant="outline" onclick={() => void read(key, true)}>Try again</Button>
			</Alert.Root>
		{/if}
		{#key key}
			{@const Detail = detailComponentFor(shown.detail.kind)}
			<Detail detail={shown.detail} onChanged={refreshAfterCommand} />
		{/key}
	{:else if shown?.status === 'notFound'}
		<Alert.Root class="max-w-[620px]">
			<Alert.Description>This {kindView.label.toLowerCase()} no longer exists.</Alert.Description>
		</Alert.Root>
	{:else if shown?.status === 'error'}
		<Alert.Root variant="destructive" class="max-w-[620px]">
			<Alert.Description>This {kindView.label.toLowerCase()} could not be loaded.</Alert.Description>
			<Button class="mt-1 w-fit" variant="outline" onclick={() => attempt++}>Try again</Button>
		</Alert.Root>
	{:else}
		<div class="grid max-w-[620px] gap-6" role="status" aria-label="Loading item">
			<div class="grid gap-2">
				<Skeleton class="h-3.5 w-40" />
				<Skeleton class="h-9 w-2/3" />
				<Skeleton class="h-4 w-72 max-w-full" />
			</div>
			<div class="grid gap-2 border-l-2 border-border py-0.5 pl-[18px]">
				<Skeleton class="h-5 w-full" />
				<Skeleton class="h-5 w-4/5" />
			</div>
			<div class="border-t border-border">
				{#each [0, 1, 2] as row (row)}
					<div class="grid gap-x-4 gap-y-0.5 border-b border-border py-2.5 sm:grid-cols-[180px_minmax(0,1fr)]">
						<Skeleton class="h-5 w-28" />
						<Skeleton class="h-5 w-full max-w-xs" />
					</div>
				{/each}
			</div>
			<div class="flex gap-2">
				<Skeleton class="h-8 w-52" />
				<Skeleton class="h-8 w-20" />
			</div>
		</div>
	{/if}
</div>
