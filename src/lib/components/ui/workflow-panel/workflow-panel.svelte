<script lang="ts" module>
	import { type VariantProps, tv } from 'tailwind-variants';

	export const workflowPanelVariants = tv({
		base: 'min-w-0 overflow-hidden rounded-lg border border-border bg-card text-card-foreground',
		variants: {
			variant: {
				default: 'bg-card',
				muted: 'bg-muted/25'
			}
		},
		defaultVariants: {
			variant: 'default'
		}
	});

	export type WorkflowPanelVariant = VariantProps<typeof workflowPanelVariants>['variant'];
</script>

<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils.js';

	let {
		ref = $bindable(null),
		class: className,
		variant = 'default',
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLElement>> & {
		variant?: WorkflowPanelVariant;
	} = $props();
</script>

<section
	bind:this={ref}
	data-slot="workflow-panel"
	class={cn(workflowPanelVariants({ variant }), className)}
	{...restProps}
>
	{@render children?.()}
</section>
