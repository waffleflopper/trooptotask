<script lang="ts" module>
	import { tv, type VariantProps } from 'tailwind-variants';

	export const pageShellVariants = tv({
		base: 'min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto bg-background text-foreground',
		variants: {
			density: {
				default: 'p-4 md:p-6',
				compact: 'p-3 md:p-4'
			},
			width: {
				full: '',
				content: '',
				wide: ''
			}
		},
		defaultVariants: {
			density: 'default',
			width: 'full'
		}
	});

	export const pageShellBodyVariants = tv({
		base: 'grid min-w-0 gap-6',
		variants: {
			width: {
				full: '',
				content: 'mx-auto w-full max-w-5xl',
				wide: 'mx-auto w-full max-w-7xl'
			}
		},
		defaultVariants: {
			width: 'full'
		}
	});

	export type PageShellDensity = VariantProps<typeof pageShellVariants>['density'];
	export type PageShellWidth = VariantProps<typeof pageShellVariants>['width'];
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils.js';

	type Props = HTMLAttributes<HTMLDivElement> & {
		children?: Snippet;
		density?: PageShellDensity;
		width?: PageShellWidth;
		bodyClass?: HTMLAttributes<HTMLDivElement>['class'];
	};

	let { children, density = 'default', width = 'full', bodyClass, class: className, ...restProps }: Props = $props();
</script>

<div
	data-slot="page-shell"
	data-density={density}
	data-width={width}
	class={cn(pageShellVariants({ density, width }), className)}
	{...restProps}
>
	<div data-slot="page-shell-body" class={cn(pageShellBodyVariants({ width }), bodyClass)}>
		{@render children?.()}
	</div>
</div>
