<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import * as Collapsible from '$lib/components/ui/collapsible';
	import { cn } from '$lib/utils.js';

	type Props = Omit<HTMLAttributes<HTMLElement>, 'title'> & {
		open?: boolean;
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

	let { title, summary, open = $bindable(false), children, class: className, ...restProps }: Props = $props();
</script>

<section data-slot="fact-section" class={cn('min-w-0', className)} {...restProps}>
	{#if title === undefined}
		<dl class="border-t-2 border-foreground">{@render children?.()}</dl>
	{:else if summary === undefined}
		<h2 class="border-b-2 border-foreground pb-2 font-heading text-xl font-semibold">{title}</h2>
		<dl>{@render children?.()}</dl>
	{:else}
		<Collapsible.Root bind:open>
			<h2 class="border-t-2 border-foreground">
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
