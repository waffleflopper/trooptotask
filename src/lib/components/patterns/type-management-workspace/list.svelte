<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils.js';
	import { focusSelectedRow } from './item-list.svelte';
	import { focusDetailHeading, isSinglePane, LAYOUT, whenSinglePaneStarts } from './single-pane.js';

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

	// A resize that hides this pane would strand focus on an invisible row.
	$effect(() =>
		whenSinglePaneStarts(() => {
			if (mobileHidden && ref?.contains(document.activeElement)) focusDetailHeading(ref.closest(LAYOUT));
		})
	);
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
