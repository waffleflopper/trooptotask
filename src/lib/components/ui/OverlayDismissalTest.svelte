<script lang="ts">
	import * as Popover from './popover/index.js';
	import * as Sheet from './sheet/index.js';

	let { kind }: { kind: 'sheet' | 'popover' } = $props();
</script>

<button type="button">Outside control</button>

{#if kind === 'sheet'}
	<Sheet.Root>
		<Sheet.Trigger>Manage access</Sheet.Trigger>
		<Sheet.Content>
			<Sheet.Title>Manage Access</Sheet.Title>
			<button type="button">Inside control</button>
		</Sheet.Content>
	</Sheet.Root>
{:else}
	<Popover.Root>
		<Popover.Trigger>Pick date</Popover.Trigger>
		<Popover.Content><button type="button">Inside control</button></Popover.Content>
	</Popover.Root>
{/if}
