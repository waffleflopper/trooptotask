<script lang="ts">
	import { invalidate } from '$app/navigation';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import { Button } from '$lib/components/ui/button/index.js';

	let { subject }: { subject: string } = $props();
</script>

<Alert.Root variant="destructive">
	<Alert.Title>{subject} could not be loaded</Alert.Title>
	<Alert.Description>
		Every other step still works, and you can continue past this one.
		<Button variant="outline" size="sm" class="mt-2" onclick={() => invalidate('app:setup-editor')}>Retry</Button>
	</Alert.Description>
</Alert.Root>
