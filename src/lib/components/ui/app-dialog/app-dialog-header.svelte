<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import type { Snippet } from 'svelte';
	import { cn, type WithElementRef } from '$lib/utils';
	import { getAppDialogState } from './app-dialog-context';

	let {
		ref = $bindable(null),
		class: className,
		eyebrow,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>, HTMLDivElement> & {
		/** A short mono line above the title. */
		eyebrow?: string;
		children?: Snippet;
	} = $props();

	const { tone, voice } = getAppDialogState();
	const destructive = tone === 'destructive';
	const editorial = voice === 'editorial';
</script>

<div
	bind:this={ref}
	data-slot="app-dialog-header"
	class={cn(
		'flex flex-col gap-2 px-4 pt-4',
		(destructive || editorial) &&
			'gap-2.5 px-7 pt-7 [&_[data-slot=dialog-description]]:text-[15px] [&_[data-slot=dialog-description]]:leading-[22px] [&_[data-slot=dialog-title]]:font-heading [&_[data-slot=dialog-title]]:text-[32px] [&_[data-slot=dialog-title]]:leading-8 [&_[data-slot=dialog-title]]:font-extrabold',
		destructive && '[&_[data-slot=dialog-title]]:uppercase',
		className
	)}
	{...restProps}
>
	{#if eyebrow}
		<p
			class={cn(
				'font-mono text-[11px] leading-[14px] font-medium tracking-[0.08em] uppercase',
				destructive ? 'text-destructive-text' : 'text-muted-foreground'
			)}
		>
			{eyebrow}
		</p>
	{/if}
	{@render children?.()}
</div>
