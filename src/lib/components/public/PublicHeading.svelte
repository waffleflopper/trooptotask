<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '$lib/utils';
	import { body, display } from './layout';

	interface Props {
		lines: readonly [string, string];
		tone?: 'light' | 'dark';
		accent?: boolean;
		plain?: boolean;
		level?: 'h1' | 'h2';
		lineClass?: readonly [string, string];
		children?: Snippet;
	}

	let {
		lines,
		tone = 'light',
		accent = false,
		plain = false,
		level = 'h2',
		lineClass = ['', ''],
		children
	}: Props = $props();

	const dark = $derived(tone === 'dark');
</script>

<div class="flex flex-col gap-8 xl:flex-row xl:items-end xl:justify-between xl:gap-20">
	<svelte:element this={level} class={cn(display, 'm-0')}>
		<span
			class={cn(
				'block',
				dark ? (plain ? 'text-chrome-text' : 'text-chrome-text-muted') : 'text-foreground',
				lineClass[0]
			)}>{lines[0]}</span
		>
		<span
			class={cn('block', dark ? (accent ? 'text-chrome-accent' : 'text-chrome-text') : 'text-foreground', lineClass[1])}
			>{lines[1]}</span
		>
	</svelte:element>
	{#if children}
		<div class={cn(body, 'xl:w-[420px] xl:shrink-0', dark ? 'text-chrome-text-muted' : 'text-muted-foreground')}>
			{@render children()}
		</div>
	{/if}
</div>
