<script lang="ts" module>
	import { type VariantProps, tv } from 'tailwind-variants';

	export const workflowPanelGridVariants = tv({
		base: 'grid min-w-0 gap-4',
		variants: {
			layout: {
				even: 'md:grid-cols-2',
				'side-detail': 'md:grid-cols-[minmax(14rem,0.85fr)_minmax(0,1.15fr)]'
			}
		},
		defaultVariants: {
			layout: 'side-detail'
		}
	});

	export type WorkflowPanelGridLayout = VariantProps<typeof workflowPanelGridVariants>['layout'];
</script>

<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils.js';

	let {
		ref = $bindable(null),
		class: className,
		layout = 'side-detail',
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		layout?: WorkflowPanelGridLayout;
	} = $props();
</script>

<div
	bind:this={ref}
	data-slot="workflow-panel-grid"
	class={cn(workflowPanelGridVariants({ layout }), className)}
	{...restProps}
>
	{@render children?.()}
</div>
