<script lang="ts">
	import { invalidate } from '$app/navigation';
	import * as Alert from '$lib/components/ui/alert';
	import { Button } from '$lib/components/ui/button';
	import { Spinner } from '$lib/components/ui/spinner';

	let { title }: { title: string } = $props();
	let retrying = $state(false);

	async function retry() {
		retrying = true;
		try {
			await invalidate('app:calendar-events');
		} finally {
			retrying = false;
		}
	}
</script>

<Alert.Root variant="destructive">
	<Alert.Title>{title}</Alert.Title>
	<Alert.Description>Try again in a moment.</Alert.Description>
	<div class="mt-3">
		<Button variant="outline" onclick={retry} aria-disabled={retrying ? 'true' : undefined}>
			{#if retrying}<Spinner />{/if}
			Retry
		</Button>
	</div>
</Alert.Root>
