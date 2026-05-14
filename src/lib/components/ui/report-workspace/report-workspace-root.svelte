<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils.js';

	type Props = HTMLAttributes<HTMLElement> & {
		children?: Snippet;
		ariaLabel?: string;
	};

	let { children, ariaLabel, class: className, ...restProps }: Props = $props();
</script>

<section
	data-slot="report-workspace"
	aria-label={ariaLabel}
	class={cn('flex w-full min-w-0 flex-col gap-4 bg-background text-foreground', className)}
	{...restProps}
>
	{@render children?.()}
</section>
