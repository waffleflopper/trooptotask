<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils.js';

	type Props = Omit<HTMLAttributes<HTMLElement>, 'title'> & {
		eyebrow: string;
		title: string;
		detail?: string;
		detailTone?: 'default' | 'destructive';
		/** Sits below the headline, such as a filter for the list the header introduces. */
		children?: Snippet;
	};

	let { eyebrow, title, detail, detailTone = 'default', children, class: className, ...restProps }: Props = $props();
</script>

<header data-slot="section-header" class={cn('grid min-w-0 gap-3', className)} {...restProps}>
	<div class="grid gap-0.5">
		<p class="font-mono text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">{eyebrow}</p>
		<div class="flex flex-wrap items-baseline gap-x-2.5">
			<h2 class="font-heading text-4xl leading-tight font-semibold">{title}</h2>
			{#if detail}
				<p class={cn('text-sm', detailTone === 'destructive' ? 'text-destructive-text' : 'text-muted-foreground')}>
					{detail}
				</p>
			{/if}
		</div>
	</div>
	{@render children?.()}
</header>
