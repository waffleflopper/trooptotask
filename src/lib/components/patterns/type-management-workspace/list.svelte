<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils.js';
	import { focusSelectedRow } from './item-list.svelte';
	import { isSinglePane } from './single-pane.js';

	interface Props extends WithElementRef<HTMLAttributes<HTMLElement>> {
		mobileHidden?: boolean;
	}

	let { ref = $bindable(null), class: className, mobileHidden = false, children, ...restProps }: Props = $props();

	let wasHidden: boolean | undefined;
	$effect(() => {
		if (wasHidden && !mobileHidden && isSinglePane()) {
			const grid = ref?.querySelector<HTMLElement>('[role="grid"]');
			if (grid) focusSelectedRow(grid);
			else ref?.querySelector<HTMLElement>('button, a[href]')?.focus();
		}
		wasHidden = mobileHidden;
	});
</script>

<section
	bind:this={ref}
	data-slot="type-management-workspace-list"
	data-mobile-hidden={mobileHidden || undefined}
	class={cn('min-h-0 overflow-y-auto', mobileHidden && 'max-lg:hidden', className)}
	{...restProps}
>
	{@render children?.()}
</section>
