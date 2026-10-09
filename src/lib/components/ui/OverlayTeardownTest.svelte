<script lang="ts">
	import ConfirmDialog from './ConfirmDialog.svelte';
	import * as DropdownMenu from './dropdown-menu/index.js';
	import * as Popover from './popover/index.js';

	let { kind, show = true }: { kind: 'confirm' | 'popover' | 'menu'; show?: boolean } = $props();
</script>

<button type="button">Outside control</button>

{#if show}
	{#if kind === 'confirm'}
		<ConfirmDialog title="Archive record" message="History is retained." onConfirm={() => {}} onCancel={() => {}} />
	{:else if kind === 'popover'}
		<Popover.Root open>
			<Popover.Trigger>Open details</Popover.Trigger>
			<Popover.Content><button type="button">Inside control</button></Popover.Content>
		</Popover.Root>
	{:else}
		<DropdownMenu.Root open>
			<DropdownMenu.Trigger>Open actions</DropdownMenu.Trigger>
			<DropdownMenu.Content>
				<DropdownMenu.Item>Edit</DropdownMenu.Item>
				<DropdownMenu.Item>Archive</DropdownMenu.Item>
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	{/if}
{/if}
