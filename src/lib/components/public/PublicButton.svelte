<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import { cn } from '$lib/utils';
	import { monoLabel } from './layout';

	interface Props {
		href: string;
		size?: 'sm' | 'md';
		children: Snippet;
	}

	let { href, size = 'md', children }: Props = $props();
</script>

<Button
	{href}
	variant="accent"
	size="none"
	class={cn(
		monoLabel,
		'rounded-lg bg-chrome-accent font-normal text-chrome hover:bg-chrome-accent hover:brightness-110',
		size === 'sm' ? 'h-10 px-5 max-sm:px-3 max-sm:tracking-[0.08em]' : 'h-12 px-6'
	)}
>
	{@render children()}
</Button>
