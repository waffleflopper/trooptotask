<script lang="ts" module>
	import { tv, type VariantProps } from 'tailwind-variants';
	export const inputGroupAddonVariants = tv({
		base: "text-muted-foreground h-auto gap-2 py-1.5 text-sm font-medium group-data-[disabled=true]/input-group:opacity-50 [&>kbd]:rounded-[calc(var(--radius)-5px)] [&>svg:not([class*='size-'])]:size-4 flex cursor-text items-center justify-center select-none",
		variants: {
			align: {
				'inline-start': 'pl-2 has-[>button]:ml-[-0.3rem] has-[>kbd]:ml-[-0.15rem] order-first',
				'inline-end': 'pr-2 has-[>button]:mr-[-0.3rem] has-[>kbd]:mr-[-0.15rem] order-last',
				'block-start':
					'px-2.5 pt-2 group-has-[>input]/input-group:pt-2 [.border-b]:pb-2 order-first w-full justify-start',
				'block-end': 'px-2.5 pb-2 group-has-[>input]/input-group:pb-2 [.border-t]:pt-2 order-last w-full justify-start'
			},
			variant: {
				default: '',
				muted: 'self-stretch bg-muted px-2.5 border-input'
			}
		},
		compoundVariants: [
			{ variant: 'muted', align: 'inline-start', class: 'mr-1 rounded-s-[inherit] border-e' },
			{ variant: 'muted', align: 'inline-end', class: 'ml-1 rounded-e-[inherit] border-s' }
		],
		defaultVariants: {
			align: 'inline-start',
			variant: 'default'
		}
	});

	export type InputGroupAddonAlign = VariantProps<typeof inputGroupAddonVariants>['align'];
	export type InputGroupAddonVariant = VariantProps<typeof inputGroupAddonVariants>['variant'];
</script>

<script lang="ts">
	import { cn, type WithElementRef } from '$lib/utils.js';
	import type { HTMLAttributes } from 'svelte/elements';

	let {
		ref = $bindable(null),
		class: className,
		children,
		align = 'inline-start',
		variant = 'default',
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		align?: InputGroupAddonAlign;
		/** `muted` fills the addon and rules it off, for a fixed prefix such as the host before an editable path. */
		variant?: InputGroupAddonVariant;
	} = $props();
</script>

<div
	bind:this={ref}
	role="group"
	data-slot="input-group-addon"
	data-align={align}
	class={cn(inputGroupAddonVariants({ align, variant }), className)}
	onclick={(e) => {
		if ((e.target as HTMLElement).closest('button')) {
			return;
		}
		e.currentTarget.parentElement?.querySelector('input')?.focus();
	}}
	{...restProps}
>
	{@render children?.()}
</div>
