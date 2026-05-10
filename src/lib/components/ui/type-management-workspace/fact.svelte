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
	class={cn('rounded-lg border border-border bg-muted/30 p-3', className)}
	{...restProps}
>
	<dt class="font-mono text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">{label}</dt>
	<dd class="mt-1 text-sm text-foreground">
		{@render children?.()}
	</dd>
</div>
