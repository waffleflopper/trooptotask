<script lang="ts">
	import { invalidate } from '$app/navigation';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import { Button } from '$lib/components/ui/button/index.js';

	/** `stale`: a refresh failed after the editor loaded, so it stays on screen with what it last read. */
	let { subject, stale = false }: { subject: string; stale?: boolean } = $props();
</script>

<Alert.Root variant="destructive">
	<Alert.Title>{subject} could not be {stale ? 'refreshed' : 'loaded'}</Alert.Title>
	<Alert.Description>
		{stale
			? 'What you see may be out of date. Your change was saved.'
			: 'Every other step still works, and you can continue past this one.'}
		<Button variant="outline" size="sm" class="mt-2" onclick={() => invalidate('app:setup-editor')}>Retry</Button>
	</Alert.Description>
</Alert.Root>
