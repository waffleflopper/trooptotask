<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '$lib/utils';
	import { pageGutter } from './layout';

	interface Props {
		id?: string;
		tone?: 'light' | 'dark';
		loose?: boolean;
		class?: string;
		children: Snippet;
	}

	let { id, tone = 'light', loose = false, class: className, children }: Props = $props();
</script>

<section
	{id}
	class={cn(
		'scroll-mt-20',
		loose ? 'py-20 sm:py-28 lg:py-40' : 'py-16 sm:py-24 lg:py-32',
		tone === 'dark' ? 'bg-chrome text-chrome-text' : 'bg-background text-foreground'
	)}
>
	<div class={cn(pageGutter, 'flex flex-col gap-12 lg:gap-16', className)}>
		{@render children()}
	</div>
</section>
