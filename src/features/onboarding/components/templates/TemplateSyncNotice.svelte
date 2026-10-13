<script lang="ts">
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import * as Alert from '$lib/components/ui/alert';
	import { Button } from '$lib/components/ui/button';
	import { Spinner } from '$lib/components/ui/spinner';

	let {
		activePackets,
		syncing,
		ready,
		result,
		onsync
	}: {
		activePackets: number;
		syncing: boolean;
		/** False until the member's active packets have loaded. */
		ready: boolean;
		/** What the last sync did, in one sentence. */
		result: string | null;
		onsync: () => void;
	} = $props();
</script>

<Alert.Root variant="info" role="group" aria-label="Active packets" class="grid gap-2">
	<div class="flex items-center justify-between gap-3 max-sm:flex-col max-sm:items-stretch">
		<div class="grid gap-0.5">
			<Alert.Title>
				{activePackets}
				{activePackets === 1 ? 'active packet uses' : 'active packets use'} this template
			</Alert.Title>
			<Alert.Description>
				Added or removed steps reach them when you sync. Progress on steps that stay is kept.
			</Alert.Description>
		</div>
		<Button variant="outline" size="sm" type="button" disabled={syncing || !ready} onclick={onsync}>
			{#if syncing}
				<Spinner class="size-3" />
			{:else}
				<RefreshCw aria-hidden="true" />
			{/if}
			Sync active packets
		</Button>
	</div>
	<p class="m-0 text-sm font-medium empty:hidden" role="status">
		{#if result}{result}{/if}
	</p>
</Alert.Root>
