<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cn } from '$lib/utils';
	import { monoLabel } from './layout';

	interface Props {
		label: string;
		lines: readonly [string, string];
		tone?: 'light' | 'dark';
		accent?: boolean;
		level?: 'h1' | 'h2';
		children?: Snippet;
	}

	let { label, lines, tone = 'light', accent = false, level = 'h2', children }: Props = $props();

	const dark = $derived(tone === 'dark');
</script>

<div class="flex flex-col gap-8 xl:flex-row xl:items-end xl:justify-between xl:gap-20">
	<div class="flex flex-col gap-6">
		<div class={cn(monoLabel, 'tracking-[0.14em]', dark ? 'text-chrome-accent' : 'text-accent-text')}>{label}</div>
		<svelte:element
			this={level}
			class="m-0 font-heading text-[clamp(2.75rem,8vw,5rem)] leading-[0.95] font-bold tracking-[-0.005em] uppercase"
		>
			<span class={cn('block', dark ? 'text-chrome-text-muted' : 'text-foreground')}>{lines[0]}</span>
			<span class={cn('block', dark ? (accent ? 'text-chrome-accent' : 'text-chrome-text') : 'text-foreground')}
				>{lines[1]}</span
			>
		</svelte:element>
	</div>
	{#if children}
		<div
			class={cn(
				'font-body text-lg leading-7 font-light xl:w-[420px] xl:shrink-0',
				dark ? 'text-chrome-text-muted' : 'text-muted-foreground'
			)}
		>
			{@render children()}
		</div>
	{/if}
</div>
