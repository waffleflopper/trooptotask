<script lang="ts" module>
	import { tv, type VariantProps } from 'tailwind-variants';

	export const factGridVariants = tv({
		base: 'grid min-w-0 gap-3',
		variants: {
			layout: {
				stack: 'grid-cols-1',
				two: 'md:grid-cols-2',
				three: 'md:grid-cols-3',
				rail: 'grid-cols-1'
			}
		},
		defaultVariants: {
			layout: 'stack'
		}
	});

	export type FactGridLayout = VariantProps<typeof factGridVariants>['layout'];
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils.js';

	type Props = HTMLAttributes<HTMLDivElement> & {
		children?: Snippet;
		layout?: FactGridLayout;
	};

	let { children, layout = 'stack', class: className, role, ...restProps }: Props = $props();
</script>

<div
	data-slot="fact-grid"
	data-layout={layout}
	{role}
	class={cn(factGridVariants({ layout }), className)}
	{...restProps}
>
	{@render children?.()}
</div>
