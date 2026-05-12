<script lang="ts" module>
	import { type VariantProps, tv } from 'tailwind-variants';

	export const avatarVariants = tv({
		base: 'inline-flex shrink-0 items-center justify-center rounded-full bg-muted font-mono font-semibold text-foreground',
		variants: {
			size: {
				sm: 'h-7 w-7 text-[10px]',
				md: 'h-9 w-9 text-xs',
				lg: 'h-11 w-11 text-sm'
			}
		},
		defaultVariants: {
			size: 'md'
		}
	});

	export type AvatarSize = VariantProps<typeof avatarVariants>['size'];
</script>

<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils.js';

	let {
		ref = $bindable(null),
		initials,
		size = 'md',
		class: className,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLSpanElement>> & {
		initials: string;
		size?: AvatarSize;
	} = $props();
</script>

<span bind:this={ref} data-slot="avatar" class={cn(avatarVariants({ size }), className)} {...restProps}>
	{initials}
</span>
