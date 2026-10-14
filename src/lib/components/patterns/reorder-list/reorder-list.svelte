<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils.js';
	import { ReorderController, setReorderController, type ReorderEntry } from './reorder-controller.svelte.js';

	interface Props extends WithElementRef<HTMLAttributes<HTMLDivElement>, HTMLDivElement> {
		/** The rows in their current order. `label` names a row to screen readers. */
		entries: ReorderEntry[];
		/** Called as soon as a row is dropped or moved by key. Update the order at once, then save. */
		onmove: (id: string, toIndex: number) => unknown;
		children?: Snippet;
	}

	let { ref = $bindable(null), class: className, entries, onmove, children, ...restProps }: Props = $props();

	const controller = new ReorderController(
		() => entries,
		(id, toIndex) => onmove(id, toIndex),
		() => ref
	);
	setReorderController(controller);
</script>

<div bind:this={ref} role="list" data-slot="reorder-list" class={cn('relative', className)} {...restProps}>
	{@render children?.()}
</div>
<div role="status" aria-live="polite" class="sr-only">{controller.message}</div>
