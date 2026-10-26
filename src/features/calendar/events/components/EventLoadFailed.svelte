<script lang="ts">
	import { invalidate, replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import * as Alert from '$lib/components/ui/alert';
	import { Button } from '$lib/components/ui/button';
	import { Spinner } from '$lib/components/ui/spinner';

	let { title }: { title: string } = $props();
	let retrying = $state(false);

	async function retry() {
		retrying = true;
		const { href } = page.url;
		const state = page.state;
		try {
			await invalidate('app:calendar-events');
			// invalidate() clears shallow page state, such as an open date review.
			if (page.url.href === href) replaceState('', state);
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
