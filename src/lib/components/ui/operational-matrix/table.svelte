<script lang="ts" module>
	import { type VariantProps, tv } from 'tailwind-variants';

	export const operationalMatrixTableVariants = tv({
		base: 'w-full border-collapse',
		variants: {
			variant: {
				default: '',
				// Small tinted cells set 2px apart; the selected cell is dashed-outlined and the focused one ringed.
				heat: [
					'min-w-max border-separate border-spacing-[2px]',
					'[&_[data-slot=operational-matrix-cell-trigger]]:block [&_[data-slot=operational-matrix-cell-trigger]]:w-full [&_[data-slot=operational-matrix-cell-trigger]]:rounded-[2px] [&_[data-slot=operational-matrix-cell-trigger]]:outline-none',
					'[&_[data-slot=operational-matrix-cell-trigger]]:focus-visible:relative [&_[data-slot=operational-matrix-cell-trigger]]:focus-visible:z-20 [&_[data-slot=operational-matrix-cell-trigger]]:focus-visible:ring-2 [&_[data-slot=operational-matrix-cell-trigger]]:focus-visible:ring-foreground',
					'[&_[data-selected]_[data-slot=operational-matrix-cell-trigger]]:outline-2 [&_[data-selected]_[data-slot=operational-matrix-cell-trigger]]:outline-offset-1 [&_[data-selected]_[data-slot=operational-matrix-cell-trigger]]:outline-dashed [&_[data-selected]_[data-slot=operational-matrix-cell-trigger]]:outline-foreground'
				]
			}
		},
		defaultVariants: { variant: 'default' }
	});

	export type OperationalMatrixTableVariant = VariantProps<typeof operationalMatrixTableVariants>['variant'];
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils.js';

	type Props = HTMLAttributes<HTMLTableElement> & {
		ariaLabel: string;
		/** `heat` styles the cells as a dense heat map. */
		variant?: OperationalMatrixTableVariant;
		children?: Snippet;
	};

	let { ariaLabel, variant = 'default', children, class: className, ...restProps }: Props = $props();
</script>

<table
	aria-label={ariaLabel}
	data-slot="operational-matrix-table"
	data-matrix-table
	class={cn(operationalMatrixTableVariants({ variant }), className)}
	{...restProps}
>
	{@render children?.()}
</table>
