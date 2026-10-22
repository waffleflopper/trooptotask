<script lang="ts" generics="T">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils.js';
	import { itemOffsets, visibleRange } from './virtualWindow';

	type Props = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
		items: readonly T[];
		key: (item: T) => string;
		/** Declared, never measured, so rows cannot shift when they render. */
		height: (item: T) => number;
		item: Snippet<[T, number]>;
		header?: Snippet;
		footer?: Snippet;
		overscanPx?: number;
		contentClass?: string;
		viewport?: HTMLDivElement | null;
	};

	let {
		items,
		key,
		height,
		item,
		header,
		footer,
		overscanPx = 400,
		contentClass,
		viewport = $bindable(null),
		class: className,
		...restProps
	}: Props = $props();

	let scrollTop = $state(0);
	let viewportHeight = $state(0);
	let headerHeight = $state(0);
	let focusedKey = $state<string | null>(null);

	const offsets = $derived(itemOffsets(items.map(height)));
	const range = $derived(
		visibleRange(offsets, {
			scrollTop: scrollTop - headerHeight,
			viewportHeight: viewportHeight - headerHeight,
			overscanPx
		})
	);
	const rendered = $derived.by(() => {
		const indices: number[] = [];
		for (let index = range.start; index < range.end; index++) indices.push(index);
		if (focusedKey !== null) {
			const focused = items.findIndex((candidate) => key(candidate) === focusedKey);
			if (focused >= 0 && (focused < range.start || focused >= range.end)) indices.push(focused);
		}
		return indices;
	});

	function itemKey(target: EventTarget | null): string | null {
		const element = target instanceof Element ? target.closest<HTMLElement>('[data-virtual-key]') : null;
		return element?.dataset.virtualKey ?? null;
	}

	function trackFocus(event: FocusEvent) {
		focusedKey = itemKey(event.target);
	}

	function releaseFocus(event: FocusEvent) {
		const next = event.relatedTarget;
		if (!(next instanceof Node) || !viewport?.contains(next)) focusedKey = null;
	}
</script>

<div
	bind:this={viewport}
	bind:clientHeight={viewportHeight}
	data-slot="virtual-list"
	class={cn('relative min-h-0 overflow-auto', className)}
	onscroll={(event) => (scrollTop = event.currentTarget.scrollTop)}
	onfocusin={trackFocus}
	onfocusout={releaseFocus}
	{...restProps}
>
	<div class={cn('min-w-full', contentClass)}>
		{#if header}
			<div bind:clientHeight={headerHeight} class="sticky top-0 z-10">
				{@render header()}
			</div>
		{/if}
		<div class="relative" style:height="{range.totalHeight}px">
			{#each rendered as index (key(items[index]))}
				{@const entry = items[index]}
				<div
					data-virtual-key={key(entry)}
					class="absolute inset-x-0"
					style:top="{offsets[index]}px"
					style:height="{height(entry)}px"
				>
					{@render item(entry, index)}
				</div>
			{/each}
		</div>
		{@render footer?.()}
	</div>
</div>
