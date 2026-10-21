<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import * as Collapsible from '$lib/components/ui/collapsible';
	import { cn } from '$lib/utils.js';

	type Props = Omit<HTMLAttributes<HTMLElement>, 'title'> & {
		open?: boolean;
		/** `destructive` draws the section's 2px rule in the destructive color, for Danger zone. */
		variant?: 'default' | 'destructive';
		/** Closes the untitled rows with a rule after the last one, for a page that ends on them. */
		endRule?: boolean;
		children?: Snippet;
	} & (
			| {
					title: string;
					/** A one-line digest that makes the section collapsible, shown beside the title while it is closed. */
					summary?: string;
			  }
			/** Without a title the rows open under the page header, as the settings pages do. */
			| { title?: undefined; summary?: undefined }
		);

	let {
		title,
		summary,
		open = $bindable(false),
		variant = 'default',
		endRule = false,
		children,
		class: className,
		...restProps
	}: Props = $props();

	const rule = $derived(variant === 'destructive' ? 'border-destructive' : 'border-foreground');
</script>

<section data-slot="fact-section" class={cn('min-w-0', className)} {...restProps}>
	{#if title === undefined}
		<dl class={cn('border-t-2', rule, endRule && 'border-b border-b-border')}>{@render children?.()}</dl>
	{:else if summary === undefined}
		<h2 class={cn('border-b-2 pb-2 font-heading text-xl font-semibold', rule)}>{title}</h2>
		<dl>{@render children?.()}</dl>
	{:else}
		<Collapsible.Root bind:open>
			<h2 class={cn('border-t-2', rule)}>
				<Collapsible.Trigger
					class="flex w-full items-baseline gap-4 py-3 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
				>
					<span class="font-heading text-xl font-semibold">{title}</span>
					{#if !open}
						<span class="min-w-0 flex-1 truncate text-sm font-normal text-muted-foreground">{summary}</span>
					{:else}
						<span class="flex-1"></span>
					{/if}
					<ChevronDown
						class={cn('size-4 shrink-0 self-center text-muted-foreground transition-transform', open && 'rotate-180')}
						aria-hidden="true"
					/>
				</Collapsible.Trigger>
			</h2>
			<Collapsible.Content>
				<dl class="border-t border-border">{@render children?.()}</dl>
			</Collapsible.Content>
		</Collapsible.Root>
	{/if}
</section>
