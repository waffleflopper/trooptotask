<script lang="ts">
	import type { ComponentProps, Snippet } from 'svelte';
	import * as Command from '$lib/components/ui/command/index.js';
	import { cn } from '$lib/utils.js';
	import { getComboboxContext } from './context.js';

	type Props = Omit<ComponentProps<typeof Command.List>, 'children'> & {
		children?: Snippet<[string]>;
	};

	let { class: className, children, ...restProps }: Props = $props();
	const context = getComboboxContext();
</script>

<Command.List class={cn('max-h-72 p-1', className)} {...restProps}>
	<Command.Group>
		{#each context.items as item (item)}
			{@render children?.(item)}
		{/each}
	</Command.Group>
</Command.List>
