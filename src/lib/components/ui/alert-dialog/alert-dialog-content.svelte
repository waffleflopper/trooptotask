<script lang="ts">
	import { AlertDialog as AlertDialogPrimitive } from 'bits-ui';
	import type { ComponentProps, Snippet } from 'svelte';
	import AlertDialogPortal from './alert-dialog-portal.svelte';
	import * as AlertDialog from './index.js';
	import { cn, type WithoutChildrenOrChild } from '$lib/utils.js';

	let {
		ref = $bindable(null),
		class: className,
		portalProps,
		children,
		...restProps
	}: WithoutChildrenOrChild<AlertDialogPrimitive.ContentProps> & {
		portalProps?: WithoutChildrenOrChild<ComponentProps<typeof AlertDialogPortal>>;
		children: Snippet;
	} = $props();
</script>

<AlertDialogPortal {...portalProps}>
	<AlertDialog.Overlay />
	<AlertDialogPrimitive.Content {...restProps}>
		{#snippet child({ props })}
			<div
				bind:this={ref}
				data-slot="alert-dialog-content"
				{...props}
				class={cn(
					'bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 ring-foreground/10 fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl p-4 text-sm shadow-lg ring-1 duration-100 outline-none sm:max-w-md',
					className
				)}
			>
				{@render children?.()}
			</div>
		{/snippet}
	</AlertDialogPrimitive.Content>
</AlertDialogPortal>
