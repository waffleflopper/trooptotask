<script lang="ts">
	import * as AppDialog from '$lib/components/ui/app-dialog';
	import type { ComponentProps } from 'svelte';
	import TaskingForm from './TaskingForm.svelte';

	let { onClose, ...form }: Omit<ComponentProps<typeof TaskingForm>, 'busy' | 'dirty'> = $props();

	let busy = $state(false);
	let dirty = $state(false);
</script>

<AppDialog.Root open voice="form" {busy} closeBlocked={dirty} {onClose}>
	<AppDialog.Content presentation="sheet" size="wide">
		<TaskingForm {...form} {onClose} bind:busy bind:dirty />
	</AppDialog.Content>
</AppDialog.Root>
