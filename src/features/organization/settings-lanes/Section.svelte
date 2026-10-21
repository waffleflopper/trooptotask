<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '$lib/utils.js';

	let { variant = 'default', children }: { variant?: 'default' | 'destructive'; children?: Snippet } = $props();
</script>

<section data-slot="fact-section" class="min-w-0">
	<dl class={cn('border-t-2', variant === 'destructive' ? 'border-destructive' : 'border-foreground')}>
		{@render children?.()}
	</dl>
</section>
