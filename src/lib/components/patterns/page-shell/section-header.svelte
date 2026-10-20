<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils.js';

	type Props = Omit<HTMLAttributes<HTMLElement>, 'title'> & {
		eyebrow?: string;
		title: string;
		detail?: string;
		detailTone?: 'default' | 'destructive';
		/** `compact` titles one section among several on a page, such as the person Overview's. */
		size?: 'default' | 'compact';
		/** Draws the 2px rule that opens the list below, for a page with several lists such as a settings page. */
		ruled?: boolean;
		/** Sits at the end of the headline row, such as a link to the section's full page. */
		action?: Snippet;
		/** Sits below the headline, such as a filter for the list the header introduces. */
		children?: Snippet;
	};

	let {
		eyebrow,
		title,
		detail,
		detailTone = 'default',
		size = 'default',
		ruled = false,
		action,
		children,
		class: className,
		...restProps
	}: Props = $props();
</script>

<header
	data-slot="section-header"
	class={cn('grid min-w-0 gap-3', ruled && 'border-b-2 border-foreground pb-3', className)}
	{...restProps}
>
	<div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
		<div class="grid min-w-0 gap-0.5">
			{#if eyebrow}
				<p class="font-mono text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">{eyebrow}</p>
			{/if}
			<div class="flex flex-wrap items-baseline gap-x-2.5">
				<h2
					class={size === 'compact'
						? 'font-heading text-[22px] leading-[26px] font-bold'
						: 'font-heading text-4xl leading-tight font-semibold'}
				>
					{title}
				</h2>
				{#if detail}
					<p
						class={cn(
							size === 'compact' ? 'font-mono text-xs' : 'text-sm',
							detailTone === 'destructive' ? 'text-destructive-text' : 'text-muted-foreground'
						)}
					>
						{detail}
					</p>
				{/if}
			</div>
		</div>
		{@render action?.()}
	</div>
	{@render children?.()}
</header>
