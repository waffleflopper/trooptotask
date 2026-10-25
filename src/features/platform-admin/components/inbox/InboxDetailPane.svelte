<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import { redirectToSensitiveActionStepUp } from '$features/identity';
	import * as Alert from '$lib/components/ui/alert';
	import { Button } from '$lib/components/ui/button';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import * as TypeWorkspace from '$lib/components/patterns/type-management-workspace';
	import { inboxItemKey, type InboxDetail, type InboxDetailResponse, type InboxItemRef } from '../../inboxTypes';
	import { detailComponentFor, INBOX_KIND_VIEWS } from './inboxKinds';

	let { item, onQueueStale }: { item: InboxItemRef; onQueueStale: () => void } = $props();

	type View = { key: string; status: 'ok'; detail: InboxDetail } | { key: string; status: 'notFound' | 'error' };

	const key = $derived(inboxItemKey(item));
	let view = $state.raw<View | null>(null);
	let attempt = $state(0);
	let controller: AbortController | undefined;

	// A response for an item the person already left, or for an older attempt, changes nothing.
	async function read(readKey: string) {
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
			view =
				parsed.status === 'ok'
					? { key: readKey, status: 'ok', detail: parsed.detail }
					: { key: readKey, status: 'notFound' };
		} catch {
			if (!mine.signal.aborted) view = { key: readKey, status: 'error' };
		}
	}

	$effect(() => {
		void attempt;
		const readKey = key;
		untrack(() => {
			if (view?.status === 'error') view = null;
			void read(readKey);
		});
	});

	onDestroy(() => controller?.abort());

	function refreshAfterCommand() {
		void read(key);
		onQueueStale();
	}

	const shown = $derived(view?.key === key ? view : null);
	const kindView = $derived(INBOX_KIND_VIEWS[item.kind]);
</script>

<div aria-busy={shown === null || undefined}>
	{#if shown?.status === 'ok'}
		{#key key}
			{@const Detail = detailComponentFor(shown.detail.kind)}
			<Detail detail={shown.detail} onChanged={refreshAfterCommand} />
		{/key}
	{:else if shown?.status === 'notFound'}
		<Alert.Root>
			<Alert.Description>This {kindView.label.toLowerCase()} no longer exists.</Alert.Description>
		</Alert.Root>
	{:else if shown?.status === 'error'}
		<Alert.Root variant="destructive">
			<Alert.Description>This {kindView.label.toLowerCase()} could not be loaded.</Alert.Description>
			<Button class="mt-1 w-fit" variant="outline" onclick={() => attempt++}>Try again</Button>
		</Alert.Root>
	{:else}
		<TypeWorkspace.Stack aria-label="Loading item" role="status">
			<div class="grid gap-3 border-b border-border pb-4">
				<Skeleton class="h-7 w-2/3" />
				<Skeleton class="h-5 w-24" />
			</div>
			<div class="grid gap-4">
				{#each [0, 1, 2, 3, 4] as row (row)}
					<div class="grid gap-1 sm:grid-cols-[11rem_minmax(0,1fr)]">
						<Skeleton class="h-4 w-24" />
						<Skeleton class="h-4 w-full max-w-sm" />
					</div>
				{/each}
			</div>
			<div class="border-t border-border pt-4">
				<Skeleton class="h-9 w-56" />
			</div>
		</TypeWorkspace.Stack>
	{/if}
</div>
