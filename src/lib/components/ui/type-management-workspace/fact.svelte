<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '$lib/utils.js';

	interface Props extends WithElementRef<HTMLAttributes<HTMLDivElement>, HTMLDivElement> {
		label: string;
		children?: Snippet;
	}

	let { ref = $bindable(null), class: className, label, children, ...restProps }: Props = $props();
</script>

<div
	bind:this={ref}
	data-slot="type-management-workspace-fact"
	class={cn('grid gap-1 border-b border-border/70 py-3 last:border-b-0 sm:grid-cols-[11rem_minmax(0,1fr)]', className)}
	{...restProps}
>
	<dt class="font-mono text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">{label}</dt>
	<dd class="text-sm text-foreground">
		{@render children?.()}
	</dd>
</div>
