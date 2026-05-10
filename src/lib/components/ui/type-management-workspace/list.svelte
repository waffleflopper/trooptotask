<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils.js';

	interface Props extends WithElementRef<HTMLAttributes<HTMLElement>> {
		mobileHidden?: boolean;
	}

	let { ref = $bindable(null), class: className, mobileHidden = false, children, ...restProps }: Props = $props();
</script>

<section
	bind:this={ref}
	data-slot="type-management-workspace-list"
	class={cn('min-h-0 overflow-y-auto', mobileHidden && 'hidden lg:block', className)}
	{...restProps}
>
	{@render children?.()}
</section>
