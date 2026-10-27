<script lang="ts">
	import Ellipsis from '@lucide/svelte/icons/ellipsis';
	import { Button } from '$lib/components/ui/button';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';

	interface Props {
		/** What the item is, so the menu names it: "Actions for Litters". */
		name: string;
		first: boolean;
		last: boolean;
		disabled: boolean;
		/** Omitted where an item's place is fixed, such as equipment being returned. */
		onMove?: (step: -1 | 1) => void;
		onEdit: () => void;
		editLabel?: string;
		onRemove?: () => void;
	}

	let { name, first, last, disabled, onMove, onEdit, editLabel = 'Edit', onRemove }: Props = $props();
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger {disabled}>
		{#snippet child({ props })}
			<Button {...props} variant="ghost" size="icon-sm" class="-my-1 size-7" aria-label={`Actions for ${name}`}>
				<Ellipsis />
			</Button>
		{/snippet}
	</DropdownMenu.Trigger>
	<DropdownMenu.Content align="end">
		<DropdownMenu.Item onSelect={onEdit}>{editLabel}</DropdownMenu.Item>
		{#if onMove}
			<DropdownMenu.Item disabled={first} onSelect={() => onMove(-1)}>Move up</DropdownMenu.Item>
			<DropdownMenu.Item disabled={last} onSelect={() => onMove(1)}>Move down</DropdownMenu.Item>
		{/if}
		{#if onRemove}
			<DropdownMenu.Separator />
			<DropdownMenu.Item variant="destructive" onSelect={onRemove}>Remove</DropdownMenu.Item>
		{/if}
	</DropdownMenu.Content>
</DropdownMenu.Root>
