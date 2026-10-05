<script lang="ts">
	import { Pagination as PaginationPrimitive } from 'bits-ui';
	import type { HTMLButtonAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils.js';
	import { buttonVariants, type ButtonSize } from '$lib/components/ui/button/index.js';
	let {
		ref = $bindable(null),
		disabled = false,
		class: className,
		size = 'icon',
		isActive,
		page,
		children,
		child: customChild,
		...restProps
	}: PaginationPrimitive.PageProps & {
		size?: ButtonSize;
		isActive: boolean;
	} = $props();
</script>

{#snippet Fallback()}
	{page.value}
{/snippet}

<PaginationPrimitive.Page
	bind:ref
	{page}
	{disabled}
	aria-current={isActive ? 'page' : undefined}
	data-slot="pagination-link"
	data-active={isActive}
	data-size={size}
	class={cn(buttonVariants({ size, variant: isActive ? 'outline' : 'ghost' }), 'cn-pagination-link', className)}
	{...restProps}
>
	{#snippet child({ props })}
		{@const elementProps = props as HTMLButtonAttributes}
		{@const buttonProps = {
			...elementProps,
			disabled,
			onclick: disabled ? undefined : elementProps.onclick,
			onkeydown: disabled ? undefined : elementProps.onkeydown
		}}
		{#if customChild}
			{@render customChild({ props: buttonProps })}
		{:else}
			<button {...buttonProps}>
				{#if children}
					{@render children()}
				{:else}
					{@render Fallback()}
				{/if}
			</button>
		{/if}
	{/snippet}
</PaginationPrimitive.Page>
