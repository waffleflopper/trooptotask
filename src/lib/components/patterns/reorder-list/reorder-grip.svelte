<script lang="ts">
	import GripVertical from '@lucide/svelte/icons/grip-vertical';
	import { Button, type ButtonProps } from '$lib/components/ui/button';
	import { cn } from '$lib/utils.js';
	import { getReorderController, getReorderItemId } from './reorder-controller.svelte.js';

	let { ref = $bindable(null), class: className, ...restProps }: ButtonProps = $props();

	const controller = getReorderController();
	const id = getReorderItemId();
	const dragging = $derived(controller.dragId === id);
</script>

<Button
	bind:ref
	type="button"
	variant="ghost"
	size="icon-xs"
	data-slot="reorder-grip"
	data-reorder-grip
	aria-label="Reorder {controller.label(id)}"
	aria-keyshortcuts="ArrowUp ArrowDown"
	title="Drag to reorder, or press Arrow Up or Arrow Down"
	class={cn(
		'touch-none text-muted-foreground',
		dragging ? 'cursor-grabbing text-foreground' : 'cursor-grab',
		className
	)}
	onkeydown={(event: KeyboardEvent) => controller.keydown(id, event)}
	onpointerdown={(event: PointerEvent) => controller.pointerdown(id, event)}
	onpointermove={(event: PointerEvent) => controller.pointermove(event)}
	onpointerup={() => controller.pointerup()}
	onpointercancel={() => controller.cancel()}
	{...restProps}
>
	<GripVertical aria-hidden="true" />
</Button>
