<script lang="ts" generics="T">
	import MoreHorizontalIcon from '@lucide/svelte/icons/more-horizontal';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import type { DataTableRowAction } from './types.js';

	type Props = {
		row: T;
		actions: DataTableRowAction<T>[];
		ariaLabel?: string;
		/** A request for this row is in flight: the menu cannot open and the trigger reports busy. */
		busy?: boolean;
	};

	let { row, actions, ariaLabel = 'Open row actions', busy = false }: Props = $props();
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger>
		{#snippet child({ props })}
			<Button
				type="button"
				variant="ghost"
				size="icon"
				aria-label={ariaLabel}
				{...props}
				disabled={busy}
				aria-busy={busy}
			>
				<MoreHorizontalIcon aria-hidden="true" />
			</Button>
		{/snippet}
	</DropdownMenu.Trigger>
	<DropdownMenu.Content align="end">
		{#each actions as action (action.label)}
			<DropdownMenu.Item
				disabled={action.disabled}
				variant={action.destructive ? 'destructive' : undefined}
				onSelect={() => action.onSelect(row)}
			>
				{action.label}
			</DropdownMenu.Item>
		{/each}
	</DropdownMenu.Content>
</DropdownMenu.Root>
