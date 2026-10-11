<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import type { PathnameWithSearchOrHash } from '$app/types';
	import { resolve } from '$app/paths';
	import { Badge, type BadgeVariant } from '$lib/components/ui/badge/index.js';
	import { cn } from '$lib/utils.js';

	export type RouteTabItem = {
		label: string;
		href: PathnameWithSearchOrHash;
		active?: boolean;
		badge?: string | number;
		/** Announced in place of the bare badge, e.g. `2 pending requests`. */
		badgeLabel?: string;
		badgeVariant?: BadgeVariant;
		disabled?: boolean;
	};

	type Props = HTMLAttributes<HTMLElement> & {
		items?: RouteTabItem[];
		label?: string;
	};

	let { items = [], label = 'Route sections', class: className, ...restProps }: Props = $props();

	let scroller = $state<HTMLElement>();
	const activeIndex = $derived(items.findIndex((item) => item.active));

	// Scrolls only the tab strip; scrollIntoView could also move the page.
	$effect(() => {
		void activeIndex;
		const tab = scroller?.querySelector<HTMLElement>('[aria-current="page"]');
		if (!scroller || !tab) return;
		const strip = scroller.getBoundingClientRect();
		const target = tab.getBoundingClientRect();
		if (target.left < strip.left) scroller.scrollLeft += target.left - strip.left;
		else if (target.right > strip.right) scroller.scrollLeft += target.right - strip.right;
	});
</script>

{#snippet badge(item: RouteTabItem)}
	{#if item.badge !== undefined}
		<Badge variant={item.badgeVariant ?? 'secondary'} aria-hidden={item.badgeLabel ? 'true' : undefined}
			>{item.badge}</Badge
		>
		{#if item.badgeLabel}<span class="sr-only">{item.badgeLabel}</span>{/if}
	{/if}
{/snippet}

<nav data-slot="route-tabs" aria-label={label} class={cn('min-w-0 border-b border-border', className)} {...restProps}>
	<div bind:this={scroller} class="flex min-w-0 items-center gap-1 overflow-x-auto">
		{#each items as item (item.href)}
			{#if item.disabled}
				<span
					data-slot="route-tab"
					aria-disabled="true"
					class="inline-flex h-10 shrink-0 items-center gap-2 border-b-2 border-transparent px-3 text-sm font-medium text-muted-foreground opacity-50"
				>
					<span>{item.label}</span>
					{@render badge(item)}
				</span>
			{:else}
				<a
					data-slot="route-tab"
					href={resolve(item.href as '/')}
					aria-current={item.active ? 'page' : undefined}
					class={cn(
						'inline-flex h-10 shrink-0 items-center gap-2 rounded-t-md border-b-2 px-3 text-sm font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/50',
						item.active
							? 'border-foreground text-foreground'
							: 'border-transparent text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground'
					)}
				>
					<span>{item.label}</span>
					{@render badge(item)}
				</a>
			{/if}
		{/each}
	</div>
</nav>
