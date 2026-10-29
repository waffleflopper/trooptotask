<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import * as Alert from '$lib/components/ui/alert';
	import { Button } from '$lib/components/ui/button';

	/** `stale`: a refresh failed after the page loaded, so it stays on screen with what it last read. */
	let { subject, stale = false }: { subject: string; stale?: boolean } = $props();
</script>

<section class="p-6 max-sm:p-2">
	<Alert.Root variant="destructive">
		{#if stale}
			<Alert.Title>{subject} could not be refreshed</Alert.Title>
			<Alert.Description>What you see may be out of date. Your change was saved.</Alert.Description>
		{:else}
			<Alert.Title>Unable to load {subject}</Alert.Title>
			<Alert.Description>{subject} data could not be loaded. Please try again.</Alert.Description>
		{/if}
		<div class="mt-3">
			<Button variant="outline" onclick={() => (stale ? invalidateAll() : window.location.reload())}>
				Retry {subject}
			</Button>
		</div>
	</Alert.Root>
</section>
