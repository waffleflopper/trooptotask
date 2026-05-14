<script lang="ts" module>
	import { type VariantProps, tv } from 'tailwind-variants';

	export const workflowPanelItemVariants = tv({
		base: 'min-w-0 rounded-md border border-border bg-muted/25 p-3 text-sm',
		variants: {
			selected: {
				true: 'border-ring bg-muted/50 ring-1 ring-ring/20',
				false: ''
			}
		},
		defaultVariants: {
			selected: false
		}
	});

	export type WorkflowPanelItemSelected = VariantProps<typeof workflowPanelItemVariants>['selected'];
</script>

<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils.js';

	let {
		ref = $bindable(null),
		class: className,
		selected = false,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		selected?: WorkflowPanelItemSelected;
	} = $props();
</script>

<div
	bind:this={ref}
	data-slot="workflow-panel-item"
	data-selected={selected || undefined}
	class={cn(workflowPanelItemVariants({ selected }), className)}
	{...restProps}
>
	{@render children?.()}
</div>
