<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils.js';
	import { getReorderController, setReorderItemId } from './reorder-controller.svelte.js';

	interface Props extends WithElementRef<HTMLAttributes<HTMLDivElement>, HTMLDivElement> {
		id: string;
		children?: Snippet;
	}

	let { ref = $bindable(null), class: className, id, children, ...restProps }: Props = $props();

	const controller = getReorderController();
	setReorderItemId(() => id);
	const dropEdge = $derived(controller.drop?.id === id ? controller.drop.edge : undefined);
</script>

<div
	bind:this={ref}
	role="listitem"
	data-slot="reorder-item"
	data-reorder-id={id}
	data-dragging={controller.dragId === id || undefined}
	data-drop={dropEdge}
	aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
	onkeydown={(event) => controller.itemKeydown(id, event)}
	class={cn(
		'relative data-[dragging]:opacity-60',
		'data-[drop=before]:before:absolute data-[drop=before]:before:inset-x-0 data-[drop=before]:before:top-0 data-[drop=before]:before:h-0.5 data-[drop=before]:before:bg-primary',
		'data-[drop=after]:after:absolute data-[drop=after]:after:inset-x-0 data-[drop=after]:after:bottom-0 data-[drop=after]:after:h-0.5 data-[drop=after]:after:bg-primary',
		className
	)}
	{...restProps}
>
	{@render children?.()}
</div>
