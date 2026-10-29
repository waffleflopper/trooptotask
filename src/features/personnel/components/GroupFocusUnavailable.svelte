<script lang="ts">
	import * as Alert from '$lib/components/ui/alert';
	import { Button } from '$lib/components/ui/button';
	import type { GroupFocusState } from '../groupFocusState.svelte';

	let { focus }: { focus: GroupFocusState } = $props();
</script>

{#if focus.status.kind === 'unavailable'}
	<Alert.Root variant="warning">
		<Alert.Title>Group unavailable</Alert.Title>
		<Alert.Description>
			This link points to a Group that was deleted or that you can no longer see. Nothing is shown for it.
		</Alert.Description>
		<Alert.Action>
			<Button type="button" variant="outline" size="xs" onclick={() => focus.go({ kind: 'all' }, 'pick')}>Clear</Button>
		</Alert.Action>
	</Alert.Root>
{/if}
