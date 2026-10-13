<script lang="ts">
	import GripVertical from '@lucide/svelte/icons/grip-vertical';
	import type { HTMLButtonAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils.js';
	import { getReorderController, getReorderItemId } from './reorder-controller.svelte.js';

	let { ref = $bindable(null), class: className, ...restProps }: WithElementRef<HTMLButtonAttributes> = $props();

	const controller = getReorderController();
	const id = getReorderItemId();
	const dragging = $derived(controller.dragId === id);
</script>

<button
	bind:this={ref}
	type="button"
	data-slot="reorder-grip"
	data-reorder-grip
	aria-label="Reorder {controller.label(id)}"
	aria-keyshortcuts="ArrowUp ArrowDown"
	title="Drag to reorder, or press Arrow Up or Arrow Down"
	class={cn(
		'inline-flex size-6 shrink-0 touch-none items-center justify-center rounded-sm text-muted-foreground outline-none select-none',
		'hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring',
		dragging ? 'cursor-grabbing text-foreground' : 'cursor-grab',
		className
	)}
	onkeydown={(event) => controller.keydown(id, event)}
	onpointerdown={(event) => controller.pointerdown(id, event)}
	onpointermove={(event) => controller.pointermove(event)}
	onpointerup={() => controller.pointerup()}
	onpointercancel={() => controller.cancel()}
	{...restProps}
>
	<GripVertical aria-hidden="true" class="size-4" />
</button>
