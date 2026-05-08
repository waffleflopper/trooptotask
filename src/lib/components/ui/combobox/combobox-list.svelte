<script lang="ts">
	import type { ComponentProps, Snippet } from 'svelte';
	import * as Command from '$lib/components/ui/command/index.js';
	import { cn } from '$lib/utils.js';
	import { getComboboxContext, type ComboboxOption } from './context.js';
	import ComboboxItem from './combobox-item.svelte';

	type Props = Omit<ComponentProps<typeof Command.List>, 'children'> & {
		children?: Snippet<[string, ComboboxOption]>;
	};

	let { class: className, children, ...restProps }: Props = $props();
	const context = getComboboxContext();
	const groupedItems = $derived.by(() => {
		const groups: Array<[string, ComboboxOption[]]> = [];

		for (const item of context.items) {
			const group = item.group ?? '';
			const existingGroup = groups.find(([groupName]) => groupName === group);

			if (existingGroup) {
				existingGroup[1] = [...existingGroup[1], item];
			} else {
				groups.push([group, [item]]);
			}
		}

		return groups;
	});
</script>

<Command.List class={cn('max-h-72 p-1', className)} {...restProps}>
	{#if context.loading}
		<Command.Loading>
			<div class="py-6 text-center text-sm text-muted-foreground">{context.loadingText}</div>
		</Command.Loading>
	{:else}
		{#each groupedItems as [group, items] (group)}
			<Command.Group heading={group || undefined}>
				{#each items as item (item.value)}
					{#if children}
						{@render children(item.value, item)}
					{:else}
						<ComboboxItem
							value={item.value}
							label={item.label}
							description={item.description}
							disabled={item.disabled}
						/>
					{/if}
				{/each}
			</Command.Group>
		{/each}
	{/if}
</Command.List>
